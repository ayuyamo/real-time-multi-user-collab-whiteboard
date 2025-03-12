'use client';
import { useEffect, useState, useRef, MouseEvent } from 'react';
import io, { Socket } from 'socket.io-client';
import { initSocketServer } from '@/pages/api/server-init';
import { getSocket, disconnectSocket } from '@/pages/api/client-socket';
interface Point { // represents a coordinate on the canvas where a user draws
  x: number;
  y: number;
}

// // Create a socket connection with the server
let socket: Socket | null = null;

const Whiteboard = () => {
  useEffect(() => {
    initSocketServer(); // Initialize the WebSocket server
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null); // Reference to the canvas element
  const [isDrawing, setIsDrawing] = useState<boolean>(false); // State to check if the user is drawing
  const [lines, setLines] = useState<Point[][]>([]); // State to store the lines drawn by the user
  const [currentLine, setCurrentLine] = useState<Point[]>([]); // State to store the current line being drawn by the user

  socket = getSocket(); // Get the socket instance
  // Function to get the canvas position
  const getCanvasPos = (e: MouseEvent<HTMLCanvasElement>): Point => {
    if (!canvasRef.current) { // If the canvas is not loaded yet
      return { x: 0, y: 0 };
    }
    // conver the mouse position to canvas position
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect(); // Get the canvas position and size relative to the viewport
    const x = e.clientX - rect.left; // Get the x position
    const y = e.clientY - rect.top; // Get the y position

    return { x, y };
  };

  // Start drawing
  const startDrawing = (e: MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    setCurrentLine([getCanvasPos(e)]);
  };

  // Draw on canvas
  const draw = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const newLine = [...currentLine, getCanvasPos(e)];
    setCurrentLine(newLine);

    // Draw the current line in real-time
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = 'black'; // Set the color of the lines
        ctx.lineWidth = 2; // Set the width of the lines
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas
        lines.forEach((line) => {
          ctx.beginPath();
          line.forEach((point, index) => {
            if (index === 0) {
              ctx.moveTo(point.x, point.y);
            } else {
              ctx.lineTo(point.x, point.y);
            }
          });
          ctx.stroke();
        });
        // Draw the current line
        ctx.beginPath();
        currentLine.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.stroke();
      }
    }
  };

  // Stop drawing
  const stopDrawing = () => {
    setIsDrawing(false);
    setLines((prevLines) => [...prevLines, currentLine]);
    socket?.emit('draw', currentLine);
    setCurrentLine([]);
  };

  // Socket listener to receive drawn lines from other users
  useEffect(() => {
    socket?.on('draw', (line: Point[]) => {
      setLines((prevLines) => [...prevLines, line]);
    });
    return () => {
      socket?.off('draw');
    };
  }, []);

  // Draw lines on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d'); // Get the 2D context of the canvas
      if (ctx) {
        ctx.strokeStyle = 'red'; // Set the color of the lines
        ctx.lineWidth = 2; // Set the width of the lines
        lines.forEach((line) => {
          ctx.beginPath(); // Start a new path
          line.forEach((point, index) => {
            if (index === 0) { // Move to the first point
              ctx.moveTo(point.x, point.y);
            } else {
              ctx.lineTo(point.x, point.y);
            }
          });
          ctx.stroke();
        });
      }
    }
  }, [lines]);

  // Disconnect the socket when the component is unmounted
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        style={{ border: '1px solid black', backgroundColor: 'white' }}
      />
    </div>
  );
};

export default Whiteboard;
