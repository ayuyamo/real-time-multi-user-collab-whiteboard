'use client';
import { useEffect, useState, useRef, MouseEvent, use } from 'react';
import { Socket } from 'socket.io-client';
import saveStroke from '@/components/supabase/saveStrokes';
import supabase from '@/components/supabase/supabase-auth';
import { User } from '@supabase/supabase-js';
import { io } from 'socket.io-client';
// TODO: change user color back to original color when one user stop drawing
interface Point {
    x: number;
    y: number;
}

interface WhiteboardProps {
    user: User;
}

// Create a socket connection with the server
let socket: Socket | null = null;
// TODO: add a loading spinner when the user is signing in
// TODO: add features to allow users to erase lines, change colors, and change line width
// TODO: actually allowing multiple users to draw at the same time
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
    const [userLines, setUserLines] = useState<{ [userId: string]: { drawing: Point[]; color: string; } }>({}); // State to store the lines drawn by the user
    const [offsetX, setOffsetX] = useState(0); // Horizontal pan offset
    const [offsetY, setOffsetY] = useState(0); // Vertical pan offset
    const [scale, setScale] = useState(1); // Zoom level
    const currentLineRef = useRef(currentLine); // Reference to the current line being drawn
    const userLinesRef = useRef(userLines); // Reference to the lines drawn by the user
    useEffect(() => {
        currentLineRef.current = currentLine; // Update the reference to the current line
    }, [currentLine]); // Update the reference whenever currentLine changes

    useEffect(() => {
        userLinesRef.current = userLines; // Update the reference to the sync color
    }, [userLines]); // Update the reference whenever syncColor changes

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

        socket?.emit('draw', newLine, userColor, user.id); // Emit the drawing event to the server
    };

    // Stop drawing
    const stopDrawing = async () => { // TODO: make sure once a drawing is complete the lines dont disappear when zoom in/out
        setIsDrawing(false);

        socket?.emit('stopDrawing', user.id); // Emit the stop drawing event to the server
        setLines([...lines, { drawing: currentLine, color: userColor }]); // Update the lines state with the new line
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
            const dx = e.movementX / scale; // Movement in x direction divided by scale for correct panning
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
        setRedrawTrigger(!redrawTrigger); // Trigger redraw
    };

    useEffect(() => {
        // Connect to the Socket.IO server
        socket = io({ path: '/api/socket' });

        if (user) {
            setUserColor(generateColor(user.id)); // Assign a color to the user based on their ID
        }

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

        socket?.on('draw', (line: Point[], color: string, userId: string) => {
            console.log('draw signal received -- user id:', userId);
            // TODO: take account of multiple users drawing at the same time -- cannot use current line as it will be overwritten
            // setSyncColor(color); // Set the color of the user who is drawing
            // setCurrentLine(line);
            // userLinesRef.current[userId] = { drawing: line, color: color }; // Store the line drawn by the user
            setUserLines((prevUserLines) => {
                const updatedUserLines = {
                    ...prevUserLines,
                    [userId]: { drawing: line, color }, // Add or update the user's current line
                };
                userLinesRef.current = updatedUserLines; // Keep the ref in sync with the state
                return updatedUserLines;
            });
        });
        socket?.on('stopDrawing', (userId: string) => {
            // linesRef.current.push({ drawing: currentLineRef.current, color: syncColorRef.current });
            // setLines([...linesRef.current]); // Update the lines state with the new line
            // setCurrentLine([]); // Clear the current line
            setUserLines((prevUserLines) => {
                const updatedUserLines = { ...prevUserLines };
                delete updatedUserLines[userId]; // Remove the user's line from the state
                userLinesRef.current = updatedUserLines; // Keep the ref in sync with the state
                return updatedUserLines; // Update the state with the new userLines
            });
            setLines((prevLines) => [...prevLines, userLinesRef.current[userId]]); // Update the lines state with the new line
        });

        // Clean up on unmount
        return () => {
            socket?.off('draw');
            socket?.off('stopDrawing');
            socket?.disconnect();
        };
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
            }
        };
        fetchLines();
    }, []);

    // Redraw all lines when the component mounts -- perhaps change this to a function that can be called when needed
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

                if (Object.keys(userLines).length > 0) {
                    // Draw the current line
                    Object.keys(userLines).forEach((userId) => {
                        const { drawing, color } = userLines[userId];
                        ctx.strokeStyle = color;
                        ctx.beginPath();

                        const prevPoint = drawing[drawing.length - 2];
                        const currentPoint = drawing[drawing.length - 1];

                        // Move to the previous point
                        ctx.moveTo(toScreenX(prevPoint.x), toScreenY(prevPoint.y));
                        // Draw a line to the current point
                        ctx.lineTo(toScreenX(currentPoint.x), toScreenY(currentPoint.y));
                        ctx.stroke(); // Stroke the path
                    });
                }
            }
        }
    }, [lines, userLines, redrawTrigger]); // Redraw when lines change or redrawTrigger changes

    // draw line -- perhaps change this to a function that can be called when needed
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Draw the current line
                if (currentLine.length > 1) {
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
    // // draw line -- perhaps change this to a function that can be called when needed
    // useEffect(() => {
    //     console.log('userLines changed:', userLines);
    //     const canvas = canvasRef.current;
    //     if (canvas) {
    //         const ctx = canvas.getContext('2d');
    //         if (ctx) {
    //             if (Object.keys(userLines).length > 0) {
    //                 // Draw the current line
    //                 Object.keys(userLines).forEach((userId) => {
    //                     const { drawing, color } = userLines[userId];
    //                     ctx.strokeStyle = color;
    //                     ctx.beginPath();

    //                     const prevPoint = drawing[drawing.length - 2];
    //                     const currentPoint = drawing[drawing.length - 1];

    //                     // Move to the previous point
    //                     ctx.moveTo(toScreenX(prevPoint.x), toScreenY(prevPoint.y));
    //                     // Draw a line to the current point
    //                     ctx.lineTo(toScreenX(currentPoint.x), toScreenY(currentPoint.y));
    //                     ctx.stroke(); // Stroke the path
    //                 });
    //             }
    //         }
    //     }
    // }, [userLines]); // Draw the lines drawn by other users
    // Function to sign out the user
    const handleSignOut = async () => {
        await supabase.auth.signOut();
        console.log("User signed out successfully");
    };

    return (
        <div className='flex flex-col items-center justify-center h-screen border border-amber-500 relative'>
            {user ? (
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
                        <p className="text-sm font-semibold text-black">👤 User: {user.id}</p>
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