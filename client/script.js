// WebSocket Todo List Synchronization
class TodoSynchronizer {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.userId = this.generateUniqueId();
        this.initializeWebSocket();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.loadInitialTodos();
        this.setupAnimationStyles();
    }

    // Generate a unique identifier for this client
    generateUniqueId() {
        return 'user-' + Math.random().toString(36).substr(2, 9);
    }

    // Add animation styles to the document
    setupAnimationStyles() {
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            @keyframes pulse-green {
                0% { background-color: transparent; }
                50% { background-color: rgba(0, 255, 0, 0.2); }
                100% { background-color: transparent; }
            }

            @keyframes pulse-red {
                0% { background-color: transparent; }
                50% { background-color: rgba(255, 0, 0, 0.2); }
                100% { background-color: transparent; }
            }

            @keyframes slide-in {
                from { 
                    transform: translateX(-100%);
                    opacity: 0;
                }
                to { 
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            .todo-sync-added {
                animation: slide-in 0.5s ease-out, pulse-green 1s;
            }

            .todo-sync-removed {
                animation: pulse-red 1s;
                text-decoration: line-through;
            }

            .todo-sync-reordered {
                animation: pulse-green 1s;
            }
        `;
        document.head.appendChild(styleEl);
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

    setupDragAndDrop() {
        const todoList = document.getElementById('todo-list');

        todoList.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('todo-item')) {
                e.target.classList.add('dragging');
            }
        });

        todoList.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('todo-item')) {
                e.target.classList.remove('dragging');
                this.syncTodoOrder();
            }
        });

        todoList.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = document.querySelector('.dragging');
            const siblings = [...todoList.querySelectorAll('.todo-item:not(.dragging)')];

            let nextSibling = siblings.find(sibling => {
                return e.clientY <= sibling.offsetTop + sibling.offsetHeight / 2;
            });

            todoList.insertBefore(draggingItem, nextSibling);
        });
    }

    syncTodoOrder() {
        // Get current todo order
        const todoItems = Array.from(document.querySelectorAll('#todo-list .todo-text'))
            .map(el => el.textContent);

        // Save to local storage
        localStorage.setItem('cross-browser-todos', JSON.stringify(todoItems));

        // Send order update to server
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'update-order',
                userId: this.userId,
                todos: todoItems
            }));
        }
    }

    loadInitialTodos() {
        const todos = this.getTodosFromLocalStorage();
        if (todos.length > 0) {
            // Clear existing list before loading
            this.clearAllTodos();

            // Render todos from local storage
            todos.forEach(todo => {
                this.renderTodo(todo);
            });
        }
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
                this.renderTodo(message.todo, true);
                this.saveTodoToLocalStorage(message.todo);
                break;
            case 'remove-todo':
                this.removeTodoFromLocalDOM(message.todo, true);
                this.removeTodoFromLocalStorage(message.todo);
                break;
            case 'initial-sync':
                // Clear existing todos and add synced todos
                this.clearAllTodos();
                message.todos.forEach(todo => {
                    this.renderTodo(todo, true);
                    this.saveTodoToLocalStorage(todo);
                });
                break;
            case 'update-order':
                // Clear and re-render todos in the new order with animation
                this.clearAllTodos();
                message.todos.forEach((todo, index) => {
                    this.renderTodo(todo, true);

                    // Add reorder animation to highlight the change
                    const todoItems = document.querySelectorAll('.todo-item');
                    if (todoItems[index]) {
                        todoItems[index].classList.add('todo-sync-reordered');

                        // Remove animation class after it completes
                        setTimeout(() => {
                            todoItems[index].classList.remove('todo-sync-reordered');
                        }, 1000);
                    }
                });
                // Update local storage
                localStorage.setItem('cross-browser-todos', JSON.stringify(message.todos));
                break;
        }
    }

    renderTodo(todo, isSync = false) {
        const todoList = document.getElementById('todo-list');

        // Prevent duplicate todos
        const existingTodos = Array.from(todoList.querySelectorAll('.todo-text'))
            .map(el => el.textContent);
        if (existingTodos.includes(todo)) return;

        const li = document.createElement('li');
        li.className = 'todo-item';
        li.draggable = true;

        // Add sync animation for remotely added todos
        if (isSync) {
            li.classList.add('todo-sync-added');
        }

        const todoText = document.createElement('span');
        todoText.className = 'todo-text';
        todoText.textContent = todo;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.classList.add('delete-btn');

        li.appendChild(todoText);
        li.appendChild(deleteBtn);
        todoList.appendChild(li);

        // Remove animation class after animation completes
        if (isSync) {
            setTimeout(() => {
                li.classList.remove('todo-sync-added');
            }, 2000);
        }
    }

    removeTodoFromLocalDOM(todo, isSync = false) {
        const todoList = document.getElementById('todo-list');
        const todoItems = todoList.querySelectorAll('.todo-text');

        todoItems.forEach(todoEl => {
            if (todoEl.textContent === todo) {
                const todoItem = todoEl.closest('.todo-item');

                if (isSync) {
                    todoItem.classList.add('todo-sync-removed');

                    // Remove the item after animation
                    setTimeout(() => {
                        todoItem.remove();
                    }, 1000);
                } else {
                    todoItem.remove();
                }
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