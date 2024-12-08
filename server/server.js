const WebSocket = require('ws');
const http = require('http');

class TodoSyncServer {
    constructor(port) {
        this.port = port;
        this.clients = new Set();
        this.todos = new Set();

        // Create HTTP server
        this.server = http.createServer();

        // Create WebSocket server
        this.wss = new WebSocket.Server({ server: this.server });

        // Set up WebSocket connection handling
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);

            ws.on('message', (message) => {
                this.handleMessage(ws, JSON.parse(message));
            });

            ws.on('close', () => {
                this.clients.delete(ws);
            });
        });

        // Start the server
        this.server.listen(port, () => {
            console.log(`WebSocket server running on port ${port}`);
        });
    }

    handleMessage(sender, message) {
        switch(message.type) {
            case 'connect':
                // Send existing todos to the newly connected client
                if (this.todos.size > 0) {
                    sender.send(JSON.stringify({
                        type: 'initial-sync',
                        userId: message.userId,
                        todos: Array.from(this.todos)
                    }));
                }
                break;

            case 'initial-sync':
                // Clear and update server's todo set with client's todos
                this.todos.clear();
                message.todos.forEach(todo => this.todos.add(todo));
                this.broadcastTodos(sender, message);
                break;

            case 'add-todo':
                // Add todo to the server's todo set
                this.todos.add(message.todo);
                this.broadcastTodos(sender, message);
                break;

            case 'remove-todo':
                // Remove todo from the server's todo set
                this.todos.delete(message.todo);
                this.broadcastTodos(sender, message);
                break;

            case 'update-order':
                // Update the todo list order
                // Clear and rebuild the todo set in the new order
                this.todos.clear();
                message.todos.forEach(todo => this.todos.add(todo));
                this.broadcastTodos(sender, message);
                break;
        }
    }

    broadcastTodos(sender, message) {
        // Broadcast the message to all clients except the sender
        this.clients.forEach(client => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

// Start the server on port 8080
const todoSyncServer = new TodoSyncServer(8080);