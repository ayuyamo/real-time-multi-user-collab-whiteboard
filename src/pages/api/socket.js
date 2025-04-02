import { Server } from 'socket.io';
// Disable body parsing and set up an external resolver for Socket.io
export const config = {
  api: {
    bodyParser: false, // Disable body parsing for the API route to handle raw data
    externalResolver: true, // Use an external resolver for the API route (Socket.io)
  },
};

let io;
let num_clients = 0; // Initialize a variable to keep track of the number of clients

const SocketHandler = (req, res) => {
  if (!res.socket.server.io) { // Check if the Socket.io server is already initialized
    console.log("Starting socket.io server...");
    // Create a new Socket.io server instance
    io = new Server(res.socket.server, {path: '/api/socket'});
    res.socket.server.io = io; // Attach the io instance to the server to prevent reinitialization

    // Handle incoming connections
    io.on('connection', (socket) => {
      console.log('Client connected', socket.id);
      num_clients++; // Increment the number of clients
      console.log('Number of clients connected:', num_clients);

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
          num_clients--; // Decrement the number of clients
          console.log('Client disconnected', socket.id);
          console.log('Number of clients connected:', num_clients);
      });
    });
  }
  res.end(); // End the response to the API request to avoid hanging
}

export default SocketHandler;