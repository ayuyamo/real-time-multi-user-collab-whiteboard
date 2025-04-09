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
    const [lines, setLines] = useState<{ drawing: Point[]; color: string; lineWidth: number }[]>([]); // State to store lines with color
    const [currentLine, setCurrentLine] = useState<Point[]>([]); // State to store the current line being drawn by the user

    const [userColor, setUserColor] = useState<string>('black');
    const [userLines, setUserLines] = useState<{ [userId: string]: { drawing: Point[]; color: string; lineWidth: number; } }>({}); // State to store the lines drawn by the user
    const [offsetX, setOffsetX] = useState(0); // Horizontal pan offset
    const [offsetY, setOffsetY] = useState(0); // Vertical pan offset
    const [scale, setScale] = useState(1); // Zoom level
    const currentLineRef = useRef(currentLine); // Reference to the current line being drawn
    const userLinesRef = useRef(userLines); // Reference to the lines drawn by the user
    const [isZooming, setIsZooming] = useState(false); // State to check if the user is zooming
    const [isPanning, setIsPanning] = useState(false); // State to check if the user is panning
    const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Reference to the zoom timeout
    const panningTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Reference to the panning timeout
    const [lineThickness, setLineThickness] = useState(1); // State to store the line thickness

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

        socket?.emit('draw', newLine, userColor, lineThickness, user.id); // Emit the drawing event to the server
    };

    // Stop drawing
    const stopDrawing = async () => { // TODO: make sure once a drawing is complete the lines dont disappear when zoom in/out
        setIsDrawing(false);

        socket?.emit('stopDrawing', user.id); // Emit the stop drawing event to the server
        setLines([...lines, { drawing: currentLine, color: userColor, lineWidth: lineThickness }]); // Update the lines state with the new line
        await saveStroke({ drawing: currentLine, color: userColor, lineWidth: lineThickness }); // Save the stroke to the database
        console.log('Stroke saved:', currentLine, userColor, lineThickness);
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
            setIsPanning(true); // Set panning state to true
            // Reset the debounce timer
            if (panningTimeoutRef.current) {
                clearTimeout(panningTimeoutRef.current);
            }
            // Set a new debounce timer
            panningTimeoutRef.current = setTimeout(() => {
                setIsPanning(false); // Set panning state to false after a delay
                console.log(`User ${user.id} stopped panning`);
            }, 300); // Adjust the delay as needed (300ms in this case)
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
        setIsZooming(true); // Set zooming state to true
        setRedrawTrigger(!redrawTrigger); // Trigger redraw

        // Reset the debounce timer
        if (zoomTimeoutRef.current) {
            clearTimeout(zoomTimeoutRef.current);
        }
        // Set a new debounce timer
        zoomTimeoutRef.current = setTimeout(() => {
            setIsZooming(false); // Set zooming state to false after a delay
            console.log(`User ${user.id} stopped zooming`);
        }, 300); // Adjust the delay as needed (300ms in this case)
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

        socket?.on('draw', (line: Point[], color: string, width: number, userId: string) => {
            console.log('draw signal received -- user id:', userId);
            setUserLines((prevUserLines) => {
                const updatedUserLines = {
                    ...prevUserLines,
                    [userId]: { drawing: line, color: color, lineWidth: width }, // Add or update the user's current line
                };
                userLinesRef.current = updatedUserLines; // Keep the ref in sync with the state
                return updatedUserLines;
            });
            console.log('userLines:', userLinesRef.current);
        });
        socket?.on('stopDrawing', (userId: string) => {
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
            const { data, error } = await supabase.from('drawing-rooms').select('drawing, color, line_width');
            if (error) {
                console.error('Error fetching lines:', error.message);
                return;
            } else {
                // Format the data to fit our structure
                const formattedLines = data.map((item: any) => ({
                    drawing: item.drawing, // array of points (Point[][])
                    color: item.color, // color
                    lineWidth: item.line_width, // line width
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
                if (isZooming || isPanning) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    lines.forEach(({ drawing, color, lineWidth }) => {
                        ctx.lineWidth = lineWidth; // Set the line width
                        ctx.lineCap = 'round'; // Set the line cap style
                        ctx.lineJoin = 'round'; // Set the line join style
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
                            const { drawing, color, lineWidth } = userLines[userId];
                            ctx.lineWidth = lineWidth; // Set the line width
                            ctx.lineCap = 'round'; // Set the line cap style
                            ctx.lineJoin = 'round'; // Set the line join style
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
                } else {
                    if (Object.keys(userLines).length > 0) {
                        // Draw the current line
                        Object.keys(userLines).forEach((userId) => {
                            const { drawing, color, lineWidth } = userLines[userId];
                            ctx.strokeStyle = color;
                            ctx.lineWidth = lineWidth; // Set the line width
                            ctx.lineCap = 'round'; // Set the line cap style
                            ctx.lineJoin = 'round'; // Set the line join style
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
        }
    }, [userLines, redrawTrigger]); // Redraw when lines change or redrawTrigger changes

    // draw line -- perhaps change this to a function that can be called when needed
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.lineWidth = lineThickness; // Set the line width
                ctx.lineCap = 'round'; // Set the line cap style
                ctx.lineJoin = 'round'; // Set the line join style
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

                    <div className="flex justify-center absolute top-0 right-0 bg-white p-3 rounded shadow">
                        <div className="flex items-center space-x-2 p-2">
                            <div
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: userColor }}
                            ></div>
                            <p className="text-sm font-semibold text-black">{user.user_metadata.email}</p>
                            <button
                                onClick={handleSignOut}
                                className="px-3 py-1 bg-gray-400 text-white text-sm hover:bg-gray-500 rounded-full hover:scale-110 transition-transform duration-200"
                            >
                                Sign Out
                            </button>
                        </div>

                    </div>
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 mb-4 bg-white p-3 rounded shadow flex space-x-4 hover:scale-110 transition-transform duration-300">
                        {/* Color Picker */}
                        <div className="flex items-center space-x-2">
                            <label className="text-sm font-semibold text-black">Color:</label>
                            <button
                                className="w-6 h-6 rounded-full bg-red-500 border-2 border-gray-300 hover:scale-110 transition-transform"
                                onClick={() => setUserColor('red')}
                            ></button>
                            <button
                                className="w-6 h-6 rounded-full bg-blue-500 border-2 border-gray-300 hover:scale-110 transition-transform"
                                onClick={() => setUserColor('blue')}
                            ></button>
                            <button
                                className="w-6 h-6 rounded-full bg-green-500 border-2 border-gray-300 hover:scale-110 transition-transform"
                                onClick={() => setUserColor('green')}
                            ></button>
                            <button
                                className="w-6 h-6 rounded-full bg-pink-500 border-2 border-gray-300 hover:scale-110 transition-transform"
                                onClick={() => setUserColor('#ec4899')}
                            ></button>
                            <button
                                className="w-6 h-6 rounded-full bg-black border-2 border-gray-300 hover:scale-110 transition-transform"
                                onClick={() => setUserColor('black')}
                            ></button>
                        </div>
                        {/* Line Thickness Picker */}
                        <div className="flex items-center space-x-2">
                            <label className="text-sm font-semibold text-black">Thickness:</label>
                            <select
                                value={lineThickness}
                                onChange={(e) => setLineThickness(Number(e.target.value))}
                                className="border border-gray-300 rounded px-2 py-1 text-black"
                            >
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                                <option value="4">4</option>
                                <option value="5">5</option>
                                <option value="6">6</option>
                                <option value="7">7</option>
                                <option value="8">8</option>
                                <option value="9">9</option>
                                <option value="10">10</option>
                            </select>
                        </div>
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