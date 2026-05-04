const API_URL = 'http://localhost:5000/api';

// Определяем текущую страницу
const currentPage = window.location.pathname;
const isChatPage = currentPage.includes('chat.html');
const isIndexPage = currentPage.includes('index.html') || currentPage === '/' || currentPage.endsWith('/');

// ================= СТРАНИЦА ВХОДА/РЕГИСТРАЦИИ =================
if (!isChatPage) {
    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        // Проверяем авторизацию
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                if (user.user_id) {
                    window.location.href = 'chat.html';
                }
            } catch (e) {
                console.error('Ошибка парсинга данных пользователя:', e);
                localStorage.removeItem('user');
            }
        }

        // Переключение между формами
        window.showLogin = function() {
            document.getElementById('loginForm').style.display = 'block';
            document.getElementById('registerForm').style.display = 'none';
            document.querySelectorAll('.tab-btn').forEach((btn, i) => {
                btn.classList.toggle('active', i === 0);
            });
            hideError();
        };

        window.showRegister = function() {
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('registerForm').style.display = 'block';
            document.querySelectorAll('.tab-btn').forEach((btn, i) => {
                btn.classList.toggle('active', i === 1);
            });
            hideError();
        };

        // Обработка входа
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            if (!username || !password) {
                showError('Please fill in all fields');
                return;
            }
            
            try {
                const res = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username, password})
                });
                const data = await res.json();
                
                if (data.success && data.user_id) {
                    localStorage.setItem('user', JSON.stringify(data));
                    window.location.href = 'chat.html';
                } else {
                    showError(data.error || 'Login failed');
                }
            } catch (err) {
                console.error('Login error:', err);
                showError('The server is temporarily unavailable. Please try again later.');
            }
        });

        // Обработка регистрации
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('regUsername').value.trim();
                const password = document.getElementById('regPassword').value;
                const confirm = document.getElementById('regPasswordConfirm').value;
                
                if (!username || !password || !confirm) {
                    showError('Please fill in all fields');
                    return;
                }
                
                if (password !== confirm) {
                    showError('Passwords do not match');
                    return;
                }
                
                if (password.length < 6) {
                    showError('Password must be at least 6 characters');
                    return;
                }try {
                    const res = await fetch(`${API_URL}/register`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({username, password})
                    });
                    const data = await res.json();
                    
                    if (data.success && data.user_id) {
                        localStorage.setItem('user', JSON.stringify(data));
                        window.location.href = 'chat.html';
                    } else {
                        showError(data.error || 'Registration failed');
                    }
                } catch (err) {
                    console.error('Registration error:', err);
                    showError('Connection failed. Please try again.');
                }
            });
        }

        // Вспомогательные функции для ошибок
        function showError(msg) {
            const el = document.getElementById('errorMsg');
            if (el) {
                el.textContent = msg;
                el.style.display = 'block';
                el.classList.remove('hidden');
            }
        }

        function hideError() {
            const el = document.getElementById('errorMsg');
            if (el) {
                el.style.display = 'none';
                el.textContent = '';
            }
        }
    }
}

// ================= СТРАНИЦА ЧАТА =================
if (isChatPage) {
    let currentUser = null;
    
    // Проверяем авторизацию
    try {
        const userData = localStorage.getItem('user');
        if (userData) {
            currentUser = JSON.parse(userData);
        }
    } catch (error) {
        console.error('Ошибка чтения данных пользователя:', error);
        localStorage.removeItem('user');
    }

    if (!currentUser || !currentUser.user_id) {
        console.log('Пользователь не авторизован, перенаправление на вход...');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    } else {
        console.log('Пользователь авторизован:', currentUser.username);
        
        const usernameDisplay = document.getElementById('usernameDisplay');
        if (usernameDisplay) {
            usernameDisplay.textContent = currentUser.username;
        }
    }

    let currentChatId = null;

    // Глобальные функции для HTML
    window.newChat = function() {
        currentChatId = null;
        const messagesDiv = document.getElementById('messages');
        if (messagesDiv) {
            messagesDiv.innerHTML = `
                <div class="welcome-message">
                    <div class="owl-header">The Sage Owls</div>
                    <h3>Ask the Spirit of Knowledge.</h3>
                    <p>I know ten thousand things.</p>
                </div>`;
        }
        const titleEl = document.getElementById('chatTitle');
        if (titleEl) {
            titleEl.textContent = "Wan Shi Tong's Library";
        }
        loadChatHistory();
    };

    window.sendMessage = async function() {
        const input = document.getElementById('messageInput');
        if (!input) return;
        
        const text = input.value.trim();
        if (!text) return;
        
        addMessageToUI(text, 'user');
        input.value = '';
        input.disabled = true;
        
        try {
            const res = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    user_id: currentUser.user_id,
                    message: text,
                    chat_id: currentChatId
                })
            });
            const data = await res.json();
            
            if (data.success) {
                currentChatId = data.chat_id;
                addMessageToUI(data.response, 'ai');
                loadChatHistory();
            } else {
                addMessageToUI('Error: ' + (data.error || 'Unknown error'), 'ai');
            }
        } catch (err) {
            console.error('Send error', err);
            addMessageToUI('Connection error. Please check your network.', 'ai');
        } finally {
            input.disabled = false;
            input.focus();
        }
    };

    // Отправка по Enter
    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('messageInput');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    window.sendMessage();
                }
            });
        }
    });

    window.logout = function() {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    };

    // Добавление сообщения в интерфейс
    function addMessageToUI(text, sender) {
        const messagesDiv = document.getElementById('messages');
        if (!messagesDiv) return;
        
        const welcome = messagesDiv.querySelector('.welcome-message');
        if (welcome) welcome.remove();
        
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender === 'user' ? 'user-message' : 'ai-message'}`;
        msgDiv.textContent = text;
        messagesDiv.appendChild(msgDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // Загрузка истории чатов
    async function loadChatHistory() {
        if (!currentUser || !currentUser.user_id) return;
        
        try {
            const res = await fetch(`${API_URL}/chats/${currentUser.user_id}`);
            if (!res.ok) throw new Error('Failed to load chats');
            
            const chats = await res.json();
            const container = document.getElementById('chatHistory');
            if (!container) return;
            
            container.innerHTML = '';
            
            if (chats.length === 0) {
                container.innerHTML = '<div class="no-chats">No chat history</div>';
                return;
            }
            
            chats.forEach(chat => {
                const div = document.createElement('div');
                div.className = 'history-item';
                div.textContent = chat.title || 'New Chat';
                div.dataset.chatId = chat.id;
                div.onclick = () => loadChat(chat.id);
                container.appendChild(div);
            });
        } catch (err) {
            console.log('Ошибка загрузки истории:', err);
        }
    }

    // Загрузка конкретного чата
    async function loadChat(chatId) {
        if (!currentUser || !currentUser.user_id) return;
        
        try {
            const res = await fetch(`${API_URL}/chat/${chatId}`);
            if (!res.ok) throw new Error('Failed to load chat');
            
            const data = await res.json();
            currentChatId = chatId;
            
            const titleEl = document.getElementById('chatTitle');
            if (titleEl && data.title) {
                titleEl.textContent = data.title;
            }
            
            const messagesDiv = document.getElementById('messages');
            if (messagesDiv) {
                messagesDiv.innerHTML = '';
                if (data.messages && Array.isArray(data.messages)) {
                    data.messages.forEach(msg => {
                        addMessageToUI(msg.text, msg.sender === 'user' ? 'user' : 'ai');
                    });
                }
            }
            
            document.querySelectorAll('.history-item').forEach(item => {
                item.classList.toggle('active', item.dataset.chatId == chatId);
            });
            
        } catch (err) {
            console.error('Ошибка загрузки чата:', err);
            showError('Failed to load chat');
        }
    }

    // Инициализация при загрузке страницыdocument.addEventListener('DOMContentLoaded', () => {
        newChat();
        loadChatHistory();
    };


// Универсальная функция показа ошибок
function showError(msg) {
    const el = document.getElementById('errorMsg');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(() => {
            el.style.display = 'none';
        }, 3000);
    }
}