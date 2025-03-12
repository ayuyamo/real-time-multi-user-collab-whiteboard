'use client';
import { useEffect, useState, useRef, MouseEvent } from 'react';
import { Socket } from 'socket.io-client';
import { initSocketServer } from '@/pages/api/server-init';
import { getSocket, disconnectSocket } from '@/pages/api/client-socket';
import saveStroke from '@/pages/api/supabase/saveStrokes';
import supabase from '@/pages/api/supabase/supabase-auth';
interface Point {
  x: number;
  y: number;
}

// Create a socket connection with the server
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
    if (!canvasRef.current) {
      return { x: 0, y: 0 };
    }
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
    socket?.emit('draw', newLine);
  };

  // Stop drawing
  const stopDrawing = async () => {
    setIsDrawing(false);
    await saveStroke({ drawing: currentLine, name: 'halie' });
    setCurrentLine([]);
  };

  // Fetch all the lines from the server when the component mounts
  useEffect(() => {
    const fetchLines = async () => {
      const { data, error } = await supabase.from('drawing-rooms').select('drawing');
      if (error) {
        console.error('Error fetching lines:', error.message);
        return;
      } else {
        setLines(data.map((line: any) => line.drawing));
      }
    };
    fetchLines();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      }
    }
  }, [lines]);


  // Socket listener to receive drawn lines from other users
  useEffect(() => {
    socket?.on('draw', (line: Point[]) => {
      setCurrentLine(line);
    });
    return () => {
      socket?.off('draw');
      setCurrentLine([]);
    };
  }, []);

  // draw line 
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw the current line
        if (currentLine.length > 0) {
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
    }
  }, [currentLine]);

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
