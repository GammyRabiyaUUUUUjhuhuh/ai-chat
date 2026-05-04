import os
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from ollamafreeapi import OllamaFreeAPI

# ================= НАСТРОЙКА ПРИЛОЖЕНИЯ =================
app = Flask(__name__, static_folder=".")
CORS(app)

# Инициализация клиента AI
client = OllamaFreeAPI()

# ================= РАБОТА С БД =================
def get_db():
    """Возвращает соединение с БД с доступом к колонкам по имени"""
    conn = sqlite3.connect("chat.db")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Создаёт таблицы, если их ещё нет"""
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY(chat_id) REFERENCES chats(id)
        );
    """)
    conn.commit()
    conn.close()

init_db()

# ================= МАРШРУТЫ =================
@app.route("/")
def home():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True)
    if not data or not data.get("username") or not data.get("password"):
        return jsonify(success=False, error="Требуется username и password"), 400

    username = data["username"].strip()
    password = data["password"]
    hashed_pw = generate_password_hash(password)

    conn = get_db()
    try:
        conn.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, hashed_pw))
        conn.commit()
        user = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        return jsonify(success=True, user_id=user["id"], username=username)
    except sqlite3.IntegrityError:
        return jsonify(success=False, error="Пользователь уже существует"), 409
    finally:
        conn.close()

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if not data or not data.get("username") or not data.get("password"):
        return jsonify(success=False, error="Требуется username и password"), 400

    username = data["username"].strip()
    password = data["password"]

    conn = get_db()
    user = conn.execute("SELECT id, username, password FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()

    if user and check_password_hash(user["password"], password):
        return jsonify(success=True, user_id=user["id"], username=user["username"])
    return jsonify(success=False, error="Неверный логин или пароль"), 401

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True)
    if not data or not data.get("user_id") or not data.get("message"):
        return jsonify(success=False, error="Отсутствуют user_id или message"), 400

    user_id = data["user_id"]
    message = data["message"]
    chat_id = data.get("chat_id")

    conn = get_db()
    try:
        # 1. Создаём чат, если он не указан
        if not chat_id:
            title = (message[:50] + "...") if len(message) > 50 else message
            cur = conn.execute(
                "INSERT INTO chats (user_id, title, created_at) VALUES (?, ?, ?)",
                (user_id, title, datetime.now().isoformat())
            )
            conn.commit()
            chat_id =cur.lastrowid

        # 2. Сохраняем сообщение пользователя
        conn.execute(
            "INSERT INTO messages (chat_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (chat_id, "user", message, datetime.now().isoformat())
        )
        conn.commit()

        # 3. Запрос к AI (ИСПРАВЛЕНО)
        try:
            ai_response = client.chat(
                model="llama3:latest",
                prompt=message,
                temperature=0.7
            )
            # ai_response — это строка, ничего делать с ней не нужно
        except Exception as ai_err:
            ai_response = f"Ошибка AI: {str(ai_err)}"
            print(f"DEBUG: Ошибка AI: {ai_err}")

        # 4. Сохраняем ответ ассистента (даже если это текст ошибки)
        conn.execute(
            "INSERT INTO messages (chat_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (chat_id, "assistant", ai_response, datetime.now().isoformat())
        )
        conn.commit()

        return jsonify(success=True, response=ai_response, chat_id=chat_id)
    except Exception as e:
        return jsonify(success=False, error=str(e)), 500
    finally:
        conn.close()

@app.route("/api/chats/<int:user_id>", methods=["GET"])
def get_user_chats(user_id):
    """Загружает список чатов пользователя для боковой панели"""
    conn = get_db()
    try:
        chats = conn.execute(
            "SELECT id, title, created_at FROM chats WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
        return jsonify([{"id": c["id"], "title": c["title"] or "New Chat", "created_at": c["created_at"]} for c in chats])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.route("/api/chat/<int:chat_id>", methods=["GET"])
def get_chat(chat_id):
    """Загружает конкретный чат с сообщениями"""
    conn = get_db()
    try:
        chat = conn.execute("SELECT id, title, user_id FROM chats WHERE id = ?", (chat_id,)).fetchone()
        if not chat:
            return jsonify({"error": "Chat not found"}), 404

        msgs = conn.execute(
            "SELECT role, content, timestamp FROM messages WHERE chat_id = ? ORDER BY timestamp ASC",
            (chat_id,)
        ).fetchall()

        formatted_messages = [
            {
                "sender": "ai" if m["role"] == "assistant" else "user",
                "text": m["content"],
                "timestamp": m["timestamp"]
            }
            for m in msgs
        ]

        return jsonify({
            "id": chat["id"],
            "title": chat["title"] or "New Chat",
            "messages": formatted_messages
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.route("/api/chat/<int:chat_id>/messages", methods=["GET"])
def get_messages(chat_id):
    """Альтернативный эндпоинт для получения сырых сообщений"""
    conn = get_db()
    try:
        msgs = conn.execute(
            "SELECT role, content, timestamp FROM messages WHERE chat_id = ? ORDER BY id",
            (chat_id,)
        ).fetchall()
        return jsonify([{"role": m["role"], "content": m["content"], "timestamp": m["timestamp"]} for m in msgs])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# ================= ЗАПУСК =================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)