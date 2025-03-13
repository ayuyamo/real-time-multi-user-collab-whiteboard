import { io, Socket } from 'socket.io-client';
let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io({ path: '/api/socket' });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
