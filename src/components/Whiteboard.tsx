'use client';
import { useEffect, useState, useRef, MouseEvent, use } from 'react';
import { Socket } from 'socket.io-client';
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

    const [offsetX, setOffsetX] = useState(0); // Horizontal pan offset
    const [offsetY, setOffsetY] = useState(0); // Vertical pan offset
    const [scale, setScale] = useState(1); // Zoom level
    const [fetchTrigger, setFetchTrigger] = useState(false); // Trigger to fetch lines from the server

    // convert coordinates
    const toScreenX = (xTrue: number) => {
        return (xTrue + offsetX) * scale;
    }
    const toScreenY = (yTrue: number) => {
        return (yTrue + offsetY) * scale;
    }
    const toTrueX = (xScreen: number) => {
        return (xScreen / scale) - offsetX;
    }
    const toTrueY = (yScreen: number) => {
        return (yScreen / scale) - offsetY;
    }
    const trueHeight = () => {
        if (!canvasRef.current) {
            throw new Error("Canvas reference is not set");
        }
        return canvasRef.current.clientHeight / scale;
    }
    const trueWidth = (): number => {
        if (!canvasRef.current) {
            throw new Error("Canvas reference is not set");
        }
        return canvasRef.current.clientWidth / scale;
    };


    // Function to get the canvas position
    const getCanvasPos = (e: MouseEvent<HTMLCanvasElement>): Point => {
        if (!canvasRef.current) {
            return { x: 0, y: 0 };
        }
        // const rect = canvas.getBoundingClientRect();
        const x = e.pageX;
        const y = e.pageY;

        return { x, y };
    };


    // Start drawing
    const startDrawing = (e: MouseEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        const newPoint: Point = {
            x: toTrueX(getCanvasPos(e).x),
            y: toTrueY(getCanvasPos(e).y),
        }
        setCurrentLine([newPoint]);
    };

    // Draw on canvas
    const draw = (e: MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const newPoint: Point = {
            x: toTrueX(getCanvasPos(e).x),
            y: toTrueY(getCanvasPos(e).y),
        };
        const newLine = [...currentLine, newPoint];
        setCurrentLine(newLine);

        socket?.emit('draw', newLine, userColor); // Emit the drawing event to the server
    };

    // Stop drawing
    const stopDrawing = async () => { // TODO: make sure once a drawing is complete the lines dont disappear when zoom in/out
        setIsDrawing(false);

        socket?.emit('stopDrawing'); // Emit the stop drawing event to the server
        await saveStroke({ drawing: currentLine, color: userColor });
        setCurrentLine([]);
    };

    const [leftMouseDown, setLeftMouseDown] = useState(false);
    const [rightMouseDown, setRightMouseDown] = useState(false);
    const onMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
        if (e.button === 0) { // Left mouse button
            setLeftMouseDown(true);
            setRightMouseDown(false);
            startDrawing(e);
        } else if (e.button === 2) { // Right mouse button
            setRightMouseDown(true);
            setLeftMouseDown(false);
        }
    };

    const [redrawTrigger, setRedrawTrigger] = useState(false);

    const onMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
        if (leftMouseDown) {    // Left mouse button is down
            draw(e);
        } else if (rightMouseDown) { // Right mouse button is down
            const dx = e.movementX / scale; // Movement in x direction
            const dy = e.movementY / scale; // Movement in y direction
            setOffsetX(offsetX + dx); // Update horizontal offset
            setOffsetY(offsetY + dy); // Update vertical offset
            setRedrawTrigger(!redrawTrigger); // Trigger redraw
        }
    };

    const onMouseUp = (e: MouseEvent<HTMLCanvasElement>) => {
        if (leftMouseDown) { // Left mouse button
            setLeftMouseDown(false);
            stopDrawing();
        } else if (rightMouseDown) { // Right mouse button
            setRightMouseDown(false);
        }
    }

    const onMouseWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        const deltaY = e.deltaY;
        const scaleAmount = -deltaY / 200; // Adjust the scale amount as needed
        setScale(scale * (1 + scaleAmount)); // Update the scale

        var distX = e.pageX / canvasRef.current!.clientWidth;
        var distY = e.pageY / canvasRef.current!.clientHeight;

        // calculate how much we need to zoom
        const unitsZoomedX = trueWidth() * scaleAmount; // this is the amount the true width is increasing/decreasing by after zooming
        const unitsZoomedY = trueHeight() * scaleAmount; // this is the amount we zoomed in the y direction

        // calculate how many pixels the cursor has moved in the x and y direction
        const unitsAddLeft = unitsZoomedX * distX;
        const unitsAddTop = unitsZoomedY * distY;

        setOffsetX(offsetX - unitsAddLeft); // Update horizontal offset
        setOffsetY(offsetY - unitsAddTop); // Update vertical offset
        setFetchTrigger(!fetchTrigger); // Trigger fetch
        setRedrawTrigger(!redrawTrigger); // Trigger redraw
    };

    useEffect(() => {
        // Connect to the Socket.IO server
        socket = io({ path: '/api/socket' });

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
                // setRedrawTrigger(!redrawTrigger); // Trigger redraw
            }
        };
        fetchLines();
    }, [fetchTrigger]);

    // Redraw all lines when the component mounts
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
                            ctx.moveTo(toScreenX(point.x), toScreenY(point.y)); // Move to the first point
                        } else { // Draw line to the next point
                            ctx.lineTo(toScreenX(point.x), toScreenY(point.y));
                        }
                    });
                    ctx.stroke(); // Stroke the path
                });
            }
        }
    }, [redrawTrigger]); // Redraw when lines change or redrawTrigger changes

    // draw line 
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Draw the current line
                if (currentLine.length > 1) {
                    console.log('user id is: ', userId);
                    console.log('user color is: ', generateColor(userId!));
                    ctx.strokeStyle = userColor;
                    ctx.beginPath();

                    const prevPoint = currentLine[currentLine.length - 2];
                    const currentPoint = currentLine[currentLine.length - 1];

                    // Move to the previous point
                    ctx.moveTo(toScreenX(prevPoint.x), toScreenY(prevPoint.y));
                    // Draw a line to the current point
                    ctx.lineTo(toScreenX(currentPoint.x), toScreenY(currentPoint.y));
                    ctx.stroke(); // Stroke the path
                }
            }
        }
    }, [currentLine]);


    // Socket listener to receive drawn lines from other users
    useEffect(() => {
        socket?.on('draw', (line: Point[], color: string) => {
            setUserColor(color); // Update the color for the current user
            setCurrentLine(line);
        });
        socket?.on('stopDrawing', () => {
            console.log("stopDrawing event received by user", userId);
            console.log('currentLine: ', currentLine);
            // setLines((prevLines) => [...prevLines, { drawing: currentLine, color: userColor }]); // Save the line to the state
            console.log("lines updated (other client): include ", currentLine, userColor);
            // setUserColor(generateColor(user.id)); // Update the color for the current user
            // setCurrentLine([]); // Clear the current line
        });
        return () => {
            socket?.off('draw');
            socket?.off('stopDrawing');
        };
    }, []);

    // Function to sign out the user
    const handleSignOut = async () => {
        await supabase.auth.signOut();
        console.log("User signed out successfully");
    };

    return (
        <div className='flex flex-col items-center justify-center h-screen border border-amber-500 relative'>
            {userId ? (
                <div>
                    <canvas className='fixed top-0 left-0 w-full h-full z-0 bg-white'
                        ref={canvasRef}
                        width={window.innerWidth}
                        height={window.innerHeight}
                        onMouseDown={onMouseDown}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onWheel={onMouseWheel}
                    />

                    <div className="absolute top-0 right-0 bg-white p-3 rounded shadow opacity-0 hover:opacity-100 transition-opacity duration-300">
                        <p className="text-sm font-semibold text-black">👤 User: {userId}</p>
                        <button
                            onClick={handleSignOut}
                            className="mt-2 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                        >
                            Sign Out
                        </button>

                    </div>
                </div>

            ) : (
                <span style={{ fontWeight: 'bold', color: 'gray' }}>
                    Loading ...
                </span>
            )}
        </div>
    );
};

export default Whiteboard;