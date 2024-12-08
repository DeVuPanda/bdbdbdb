// WebSocket Todo List Synchronization
class TodoSynchronizer {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.userId = this.generateUniqueId();
        this.initializeWebSocket();
        this.setupEventListeners();
    }

    // Generate a unique identifier for this client
    generateUniqueId() {
        return 'user-' + Math.random().toString(36).substr(2, 9);
    }

    initializeWebSocket() {
        try {
            this.socket = new WebSocket(this.serverUrl);

            this.socket.onopen = () => {
                console.log('WebSocket connection established');
                // Send initial connection message with user ID
                this.socket.send(JSON.stringify({
                    type: 'connect',
                    userId: this.userId
                }));
                // Sync initial todos
                this.syncInitialTodos();
            };

            this.socket.onmessage = (event) => {
                this.handleIncomingMessage(JSON.parse(event.data));
            };

            this.socket.onclose = (event) => {
                console.log('WebSocket connection closed', event);
                // Attempt to reconnect after a delay
                setTimeout(() => this.initializeWebSocket(), 5000);
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to establish WebSocket connection:', error);
        }
    }

    setupEventListeners() {
        // Listen for local todo additions
        document.getElementById('todo-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const todoInput = document.getElementById('todo-input');
            const todoText = todoInput.value.trim();

            if (todoText) {
                this.addTodo(todoText);
                todoInput.value = '';
            }
        });

        // Delegate event for delete buttons
        document.getElementById('todo-list').addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) {
                const todoItem = e.target.closest('.todo-item');
                const todoText = todoItem.querySelector('.todo-text').textContent;
                this.removeTodo(todoText);
            }
        });
    }

    syncInitialTodos() {
        // Retrieve and send initial todos to the server
        const todos = this.getTodosFromLocalStorage();
        if (todos.length > 0) {
            this.socket.send(JSON.stringify({
                type: 'initial-sync',
                userId: this.userId,
                todos: todos
            }));
        }
    }

    addTodo(todo) {
        // Add todo locally
        this.renderTodo(todo);

        // Send todo addition to server
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'add-todo',
                userId: this.userId,
                todo: todo
            }));
        }

        // Save to local storage
        this.saveTodoToLocalStorage(todo);
    }

    removeTodo(todo) {
        // Remove todo from local list
        this.removeTodoFromLocalDOM(todo);

        // Send todo removal to server
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'remove-todo',
                userId: this.userId,
                todo: todo
            }));
        }

        // Remove from local storage
        this.removeTodoFromLocalStorage(todo);
    }

    handleIncomingMessage(message) {
        // Ignore messages from the same user
        if (message.userId === this.userId) return;

        switch(message.type) {
            case 'add-todo':
                this.renderTodo(message.todo);
                this.saveTodoToLocalStorage(message.todo);
                break;
            case 'remove-todo':
                this.removeTodoFromLocalDOM(message.todo);
                this.removeTodoFromLocalStorage(message.todo);
                break;
            case 'initial-sync':
                // Clear existing todos and add synced todos
                this.clearAllTodos();
                message.todos.forEach(todo => {
                    this.renderTodo(todo);
                    this.saveTodoToLocalStorage(todo);
                });
                break;
        }
    }

    renderTodo(todo) {
        const todoList = document.getElementById('todo-list');

        // Prevent duplicate todos
        const existingTodos = Array.from(todoList.querySelectorAll('.todo-text'))
            .map(el => el.textContent);
        if (existingTodos.includes(todo)) return;

        const li = document.createElement('li');
        li.className = 'todo-item';
        li.draggable = true;

        const todoText = document.createElement('span');
        todoText.className = 'todo-text';
        todoText.textContent = todo;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.classList.add('delete-btn');

        li.appendChild(todoText);
        li.appendChild(deleteBtn);
        todoList.appendChild(li);
    }

    removeTodoFromLocalDOM(todo) {
        const todoList = document.getElementById('todo-list');
        const todoItems = todoList.querySelectorAll('.todo-text');

        todoItems.forEach(todoEl => {
            if (todoEl.textContent === todo) {
                todoEl.closest('.todo-item').remove();
            }
        });
    }

    clearAllTodos() {
        document.getElementById('todo-list').innerHTML = '';
    }

    getTodosFromLocalStorage() {
        const todos = localStorage.getItem('cross-browser-todos');
        return todos ? JSON.parse(todos) : [];
    }

    saveTodoToLocalStorage(todo) {
        let todos = this.getTodosFromLocalStorage();
        if (!todos.includes(todo)) {
            todos.push(todo);
            localStorage.setItem('cross-browser-todos', JSON.stringify(todos));
        }
    }

    removeTodoFromLocalStorage(todo) {
        let todos = this.getTodosFromLocalStorage();
        const updatedTodos = todos.filter(t => t !== todo);
        localStorage.setItem('cross-browser-todos', JSON.stringify(updatedTodos));
    }
}

// Initialize the synchronizer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Replace with your actual WebSocket server URL
    const todoSync = new TodoSynchronizer('ws://localhost:8080');
});