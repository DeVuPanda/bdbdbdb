const WebSocket = require('ws');
const http = require('http');

class TodoSyncServer {
    constructor(port) {
        this.port = port;
        this.clients = new Set();
        this.todos = new Set();

        this.server = http.createServer();

        this.wss = new WebSocket.Server({ server: this.server });

        this.wss.on('connection', (ws) => {
            this.clients.add(ws);

            ws.on('message', (message) => {
                this.handleMessage(ws, JSON.parse(message));
            });

            ws.on('close', () => {
                this.clients.delete(ws);
            });
        });

        this.server.listen(port, () => {
            console.log(`WebSocket server running on port ${port}`);
        });
    }

    handleMessage(sender, message) {
        switch(message.type) {
            case 'connect':
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
        this.clients.forEach(client => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }
}

const todoSyncServer = new TodoSyncServer(8080);