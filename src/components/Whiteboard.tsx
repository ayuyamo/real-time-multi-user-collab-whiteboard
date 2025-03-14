'use client';
import { useEffect, useState, useRef, MouseEvent } from 'react';
import { Socket } from 'socket.io-client';
// import { getSocket, disconnectSocket } from '@/components/client-socket';
import saveStroke from '@/components/supabase/saveStrokes';
import supabase from '@/components/supabase/supabase-auth';
import { User } from '@supabase/supabase-js';
import { io } from 'socket.io-client';
interface Point {
    x: number;
    y: number;
}

interface WhiteboardProps {
    user: User;
}

// Create a socket connection with the server
let socket: Socket | null = null;

const generateColor = (id: string) => {
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
        'red', 'blue', 'green', 'purple', 'orange', 'teal', 'pink', 'cyan',
        'yellow', 'brown', 'magenta', 'lime', 'indigo', 'violet', 'gold', 'silver',
        'navy', 'maroon', 'turquoise', 'coral', 'salmon', 'plum', 'olive', 'orchid'
    ];

    return colors[hash % colors.length];
};

const Whiteboard: React.FC<WhiteboardProps> = ({ user }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null); // Reference to the canvas element
    const [isDrawing, setIsDrawing] = useState<boolean>(false); // State to check if the user is drawing
    const [lines, setLines] = useState<{ drawing: Point[]; color: string }[]>([]); // State to store lines with color
    const [currentLine, setCurrentLine] = useState<Point[]>([]); // State to store the current line being drawn by the user
    const [userColor, setUserColor] = useState<string>('black');
    const [userId, setUserId] = useState<string | null>(null);
    useEffect(() => {
        // Connect to the Socket.IO server
        socket = io();

        // Handle connection events
        socket.on('connect', () => {
            console.log('Connected to the server:', socket?.id);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from the server');
        });

        socket.on('message', (data) => {
            console.log('Received message:', data);
        });

        // Clean up on unmount
        return () => {
            socket?.disconnect();
        };
    }, []);

    // Fetch user and assign color
    useEffect(() => {
        if (user) {
            setUserId(user.id);
            setUserColor(generateColor(user.id));
        } else {
            setUserId(null);
            setUserColor('black');
        }
    }, []);

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
        await saveStroke({ drawing: currentLine, color: userColor });
        setCurrentLine([]);
    };

    // Fetch all the lines from the server when the component mounts
    useEffect(() => {
        const fetchLines = async () => {
            const { data, error } = await supabase.from('drawing-rooms').select('drawing, color');
            if (error) {
                console.error('Error fetching lines:', error.message);
                return;
            } else {
                // Format the data to fit our structure
                const formattedLines = data.map((item: any) => ({
                    drawing: item.drawing, // array of points (Point[][])
                    color: item.color, // color
                }));
                setLines(formattedLines); // Update state with fetched lines
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
                lines.forEach(({ drawing, color }) => {
                    ctx.strokeStyle = color;
                    ctx.beginPath();
                    drawing.forEach((point, index) => {
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
                    ctx.strokeStyle = userColor; // TODO: when 'draw' is emitted send the colors associated with the person drawing too for accurate display of whiteboard in real time
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

    // Function to sign out the user
    const handleSignOut = async () => {
        await supabase.auth.signOut();
        console.log("User signed out successfully");
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ marginBottom: '10px' }}>
                {userId ? (
                    <>
                        <span style={{ color: userColor, fontWeight: 'bold' }}>
                            Signed in as: {userId} (Color: {userColor})
                        </span>
                        <button
                            onClick={handleSignOut}
                            style={{
                                marginLeft: '10px',
                                padding: '5px 10px',
                                backgroundColor: 'red',
                                color: 'white',
                                border: 'none',
                                borderRadius: '5px',
                                cursor: 'pointer',
                            }}
                        >
                            Sign Out
                        </button>
                        <canvas
                            ref={canvasRef}
                            width={800}
                            height={600}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            style={{ border: '1px solid black', backgroundColor: 'white' }}
                        />
                    </>
                ) : (
                    <span style={{ fontWeight: 'bold', color: 'gray' }}>
                        Not signed in
                    </span>
                )}
            </div>

        </div>
    );
};

export default Whiteboard;