import { Server } from 'socket.io';
//TODO: make this a websocket 
// Disable body parsing and set up an external resolver for Socket.io
export const config = {
  api: {
    bodyParser: false, // Disable body parsing
    externalResolver: true, // Use an external resolver
  },
};

let io;

const SocketHandler = (req, res) => {
  if (!res.socket.server.io) {
    console.log("Starting socket.io server...");
    io = new Server(res.socket.server, {path: '/api/socket'});
    res.socket.server.io = io;

    // Handle incoming connections
    io.on('connection', (socket) => {
      console.log('Client connected', socket.id);

      // listen for drawing events from the client
      socket.on('draw', (line, color) => {
          console.log('draw', line);
          socket.broadcast.emit('draw', line, color); // broadcast drawing to all other clients
      });
      // listen for stop drawing event from the client
      socket.on('stopDrawing', () => {
          console.log('stop drawing signal received');
          socket.broadcast.emit('stopDrawing'); // broadcast drawing to all other clients
      });

      // Handle user disconnection
      socket.on('disconnect', () => {
          console.log('Client disconnected', socket.id);
      });
    });
  }
  res.end();
}

export default SocketHandler;