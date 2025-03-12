let serverInitialized = false;

export const initSocketServer = () => {
  if (!serverInitialized) {
    serverInitialized = true;
    fetch('/api/server-socket')
      .then(() => console.log('Server initialized'))
      .catch((err) => console.error('Server initialization error:', err));
  }
};
