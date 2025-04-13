'use client';
import { useEffect, useState, useRef, MouseEvent, use } from 'react';
import { Socket } from 'socket.io-client';
import { saveStroke, deleteLines, fetchLines } from '@/components/supabase/dataMod';
import supabase from '@/components/supabase/supabase-auth';
import { User } from '@supabase/supabase-js';
import { io } from 'socket.io-client';
import ColorPalette from './whiteboard-props/color-palette';
import ThicknessSelector from './whiteboard-props/thichness-selector';
import { v4 as uuidv4 } from 'uuid';

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

const Whiteboard: React.FC<WhiteboardProps> = ({ user }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null); // Reference to the canvas element
    const [isDrawing, setIsDrawing] = useState<boolean>(false); // State to check if the user is drawing
    const [lines, setLines] = useState<{ uuid: string; drawing: Point[]; color: string; lineWidth: number }[]>([]); // State to store lines with color
    const [currentLine, setCurrentLine] = useState<Point[]>([]); // State to store the current line being drawn by the user

    const [userColor, setUserColor] = useState<string>('black');
    const [userLines, setUserLines] = useState<{ [userId: string]: { drawing: Point[]; color: string; lineWidth: number; } }>({}); // State to store the lines drawn by the user
    const [offsetX, setOffsetX] = useState(0); // Horizontal pan offset
    const [offsetY, setOffsetY] = useState(0); // Vertical pan offset
    const [scale, setScale] = useState(1); // Zoom level
    const currentLineRef = useRef(currentLine); // Reference to the current line being drawn
    const userLinesRef = useRef(userLines); // Reference to the lines drawn by the user
    const linesRef = useRef(lines); // Reference to the lines drawn by all users
    const [isZooming, setIsZooming] = useState(false); // State to check if the user is zooming
    const [isPanning, setIsPanning] = useState(false); // State to check if the user is panning
    const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Reference to the zoom timeout
    const panningTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Reference to the panning timeout
    const [lineThickness, setLineThickness] = useState(1); // State to store the line thickness
    const [isPaletteOpen, setIsPaletteOpen] = useState(false); // State to check if the color palette is open
    const [isReloading, setIsReloading] = useState(false); // State to check if the canvas is refreshing
    const [isEraserMode, setIsEraserMode] = useState(false); // State to check if the eraser mode is active
    const [selectingThickness, setSelectingThickness] = useState(false);
    const [screenChanged, setScreenChanged] = useState(false); // State to check if the screen has changed


    const togglePalette = () => {
        setIsPaletteOpen(!isPaletteOpen); // Toggle the color palette visibility
        setIsEraserMode(false); // Disable eraser mode when the palette is open
    };

    const handleColorSelect = (color: string) => {
        setUserColor(color); // Set the selected color
        setIsPaletteOpen(false); // Close the color palette
    };

    useEffect(() => {
        currentLineRef.current = currentLine; // Update the reference to the current line
    }, [currentLine]); // Update the reference whenever currentLine changes

    useEffect(() => {
        linesRef.current = lines; // Update the reference to the lines
    }, [lines]); // Update the reference whenever lines changes

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
    // eraser mode
    const isEraserOverLine = (e: MouseEvent<HTMLCanvasElement>, line: Point[], baseThreshold = 10) => {
        const adjustedThreshold = baseThreshold / scale;
        return line.some((point) => {
            const dx = point.x - toTrueX(getCanvasPos(e).x);
            const dy = point.y - toTrueY(getCanvasPos(e).y);
            return Math.sqrt(dx * dx + dy * dy) < adjustedThreshold;
        });
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

        const newUUID = uuidv4(); // Generate a new UUID for the line
        socket?.emit('stopDrawing', user.id, newUUID); // Emit the stop drawing event to the server
        setLines([...lines, { uuid: newUUID, drawing: currentLine, color: userColor, lineWidth: lineThickness }]); // Update the lines state with the new line
        await saveStroke({ uuid: newUUID, drawing: currentLine, color: userColor, lineWidth: lineThickness }); // Save the stroke to the database
        console.log('Stroke saved:', newUUID, currentLine, userColor, lineThickness);
        setCurrentLine([]);
    };

    const [leftMouseDown, setLeftMouseDown] = useState(false);
    const [rightMouseDown, setRightMouseDown] = useState(false);
    const onMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
        if (e.button === 0) { // Left mouse button
            setLeftMouseDown(true);
            setRightMouseDown(false);
            if (!isEraserMode) {
                startDrawing(e);
            }
        } else if (e.button === 2) { // Right mouse button
            setRightMouseDown(true);
            setLeftMouseDown(false);
        }
    };


    const onMouseMove = async (e: MouseEvent<HTMLCanvasElement>) => {
        if (leftMouseDown) {    // Left mouse button is down
            if (isEraserMode) {
                // const ctx = canvasRef.current?.getContext('2d');
                // if (!ctx) return;
                // ctx.clearRect(toScreenX(toTrueX(getCanvasPos(e).x)), toScreenY(toTrueY(getCanvasPos(e).y)), 20, 20); // Clear the area around the cursor

                const linesToDelete = lines.filter((line) =>
                    isEraserOverLine(e, line.drawing)
                );

                if (linesToDelete.length > 0) {
                    // Remove all at once
                    setLines((prevLines) =>
                        prevLines.filter((l) => !linesToDelete.includes(l))
                    );
                    socket?.emit('deleteLines', user.id, linesToDelete); // Emit the delete event to the server
                    const idsToDelete = linesToDelete.map((line) => line.uuid);
                    deleteLines(idsToDelete); // Delete the lines from the database
                }
            } else {
                draw(e);
            }
        } else if (rightMouseDown) { // Right mouse button is down
            const dx = e.movementX / scale; // Movement in x direction divided by scale for correct panning
            const dy = e.movementY / scale; // Movement in y direction
            setOffsetX(offsetX + dx); // Update horizontal offset
            setOffsetY(offsetY + dy); // Update vertical offset
            setIsPanning(true); // Set panning state to true
            setScreenChanged(!screenChanged); // Trigger a screen change
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
            if (!isEraserMode) {
                stopDrawing(); // Stop drawing
            }
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
        setScreenChanged(!screenChanged); // Trigger a screen change

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
    // Load lines from the server when the component mounts or data changes
    const loadLines = async () => {
        const fetchedLines = await fetchLines();  // Fetch lines from server
        console.log('Fetched lines:', fetchedLines); // Log the fetched lines
        console.log('reloading lines...'); // Log the redraw trigger state
        setLines(fetchedLines);                   // Update canvas state
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
        socket?.on('stopDrawing', (userId: string, uuid: string) => {
            setUserLines((prevUserLines) => {
                const updatedUserLines = { ...prevUserLines };
                delete updatedUserLines[userId]; // Remove the user's line from the state
                userLinesRef.current = updatedUserLines; // Keep the ref in sync with the state
                return updatedUserLines; // Update the state with the new userLines
            });
            setLines((prevLines) => [...prevLines, { uuid: uuid, ...userLinesRef.current[userId] }]); // Update the lines state with the new line
        });

        socket?.on('deleteLines', (userId: string, linesToDelete: {
            uuid: string;
            drawing: {
                x: number;
                y: number;
            }[];
            color: string;
            lineWidth: number;
        }[]) => {
            console.log('deleteLines signal received -- user id:', userId);
            console.log('lines to delete:', linesToDelete);
            setLines((prevLines) =>
                prevLines.filter((line) => !linesToDelete.some((l) => l.uuid === line.uuid))
            );
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
        loadLines();
    }, []);

    // Function to draw a single line
    const drawLine = (ctx: CanvasRenderingContext2D, drawing: Point[], color: string, lineWidth: number) => {
        ctx.lineWidth = lineWidth; // Set the line width
        ctx.lineCap = 'round'; // Set the line cap style
        ctx.lineJoin = 'round'; // Set the line join style
        ctx.strokeStyle = color;
        ctx.beginPath();
        drawing.forEach((point, index) => {
            if (index === 0) {
                ctx.moveTo(toScreenX(point.x), toScreenY(point.y)); // Move to the first point
            } else {
                ctx.lineTo(toScreenX(point.x), toScreenY(point.y)); // Draw line to the next point
            }
        });
        ctx.stroke(); // Stroke the path
    };

    // Function to draw all lines
    const drawAllLines = (ctx: CanvasRenderingContext2D, lines: { drawing: Point[]; color: string; lineWidth: number }[]) => {
        lines.forEach(({ drawing, color, lineWidth }) => {
            drawLine(ctx, drawing, color, lineWidth);
        });
    };

    // Function to draw the current line
    const drawCurrentLine = (ctx: CanvasRenderingContext2D, currentLine: Point[], color: string, lineWidth: number) => {
        if (currentLine.length > 1) {
            const prevPoint = currentLine[currentLine.length - 2];
            const currentPoint = currentLine[currentLine.length - 1];
            ctx.lineWidth = lineWidth; // Set the line width
            ctx.lineCap = 'round'; // Set the line cap style
            ctx.lineJoin = 'round'; // Set the line join style
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(toScreenX(prevPoint.x), toScreenY(prevPoint.y)); // Move to the previous point
            ctx.lineTo(toScreenX(currentPoint.x), toScreenY(currentPoint.y)); // Draw a line to the current point
            ctx.stroke(); // Stroke the path
        }
    };



    // Redraw all lines when the component mounts -- perhaps change this to a function that can be called when needed
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                if (isZooming || isPanning) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    drawAllLines(ctx, lines); // Draw all lines
                    if (Object.keys(userLines).length > 0) {
                        // Draw the current line of other users
                        Object.keys(userLines).forEach((userId) => {
                            const { drawing, color, lineWidth } = userLines[userId];
                            drawLine(ctx, drawing, color, lineWidth); // Draw the user's line
                        });
                    }
                } else {
                    if (Object.keys(userLines).length > 0) {
                        // Draw the current line
                        Object.keys(userLines).forEach((userId) => {
                            const { drawing, color, lineWidth } = userLines[userId];
                            drawCurrentLine(ctx, drawing, color, lineWidth); // Draw the user's line
                        });
                    }
                }

            }
        }
    }, [userLines, screenChanged]); // Redraw when lines change or redrawTrigger changes

    // draw line -- perhaps change this to a function that can be called when needed
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                drawCurrentLine(ctx, currentLine, userColor, lineThickness); // Draw the current line
            }
        }
    }, [currentLine]);

    useEffect(() => {
        console.log('redrawTrigger triggered'); // Log the redraw trigger state
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                drawAllLines(ctx, lines); // Draw all lines
            }
        }
    }, [lines]);

    useEffect(() => {
        console.log('Eraser mode:', isEraserMode);
    }, [isEraserMode]); // Log the eraser mode state

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

                    <div className="flex justify-center absolute top-0 right-0 bg-white p-5 space-x-2 rounded shadow">
                        <div className='flex items-center group hover:scale-110 transition-transform duration-300'>
                            <div
                                className="w-4 h-4 rounded-full p-2"
                                style={{ backgroundColor: userColor }}
                            ></div>
                            <p className="text-sm font-semibold text-black p-2">{user.user_metadata.email}</p>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="px-3 py-1 bg-gray-400 text-white text-sm hover:bg-gray-500 rounded-full hover:scale-110 transition-transform duration-200"
                        >
                            Sign Out
                        </button>
                    </div>
                    <div className="items-center absolute bottom-0 left-1/2 transform -translate-x-1/2 mb-4 bg-white p-3 rounded shadow flex space-x-2 hover:scale-110 transition-transform duration-300">
                        {/* Color Picker */}
                        <button
                            className="w-6 h-6 rounded-full bg-red-500 border-2 border-gray-300 hover:scale-110 transition-transform"
                            onClick={() => { setUserColor('red'); setIsEraserMode(false); }}
                        ></button>
                        <button
                            className="w-6 h-6 rounded-full bg-blue-500 border-2 border-gray-300 hover:scale-110 transition-transform"
                            onClick={() => { setUserColor('blue'); setIsEraserMode(false); }}
                        ></button>
                        <button
                            className="w-6 h-6 rounded-full bg-green-500 border-2 border-gray-300 hover:scale-110 transition-transform"
                            onClick={() => { setUserColor('#22c55e'); setIsEraserMode(false); }}
                        ></button>
                        <button
                            className="w-6 h-6 rounded-full bg-pink-500 border-2 border-gray-300 hover:scale-110 transition-transform"
                            onClick={() => { setUserColor('#ec4899'); setIsEraserMode(false); }}
                        ></button>
                        <button
                            className="w-6 h-6 rounded-full bg-yellow-300 border-2 border-gray-300 hover:scale-110 transition-transform"
                            onClick={() => { setUserColor('#fcd34d'); setIsEraserMode(false); }}
                        ></button>
                        <button
                            className="w-6 h-6 rounded-full bg-black border-2 border-gray-300 hover:scale-110 transition-transform"
                            onClick={() => { setUserColor('black'); setIsEraserMode(false); }}
                        ></button>
                        <button
                            className="px-3 py-1 bg-gray-400 text-white text-sm hover:bg-gray-500 rounded-full hover:scale-110 transition-transform duration-200"
                            onClick={togglePalette}
                        >
                            Palette
                        </button>
                        {/* TODO: add feature to delete lines */}
                        {isPaletteOpen && <ColorPalette onSelectColor={handleColorSelect} />}
                        <button
                            className={`px-3 py-1 text-white text-sm rounded-full transition-transform duration-200 
                                        ${isEraserMode ? 'bg-gray-600 scale-110' : 'bg-gray-400 hover:bg-gray-500 hover:scale-110'}`}
                            onClick={() => setIsEraserMode(!isEraserMode)}
                        >
                            Eraser
                        </button>
                        <div className="relative inline-block hover:scale-105 transition-transform duration-200">
                            <button
                                onClick={() => { setSelectingThickness(!selectingThickness); setIsEraserMode(false); }}
                                className="border border-gray-300 rounded px-4 py-1 bg-white text-black flex items-center justify-between min-w-[80px]"
                            >
                                <div className="w-full h-4 flex items-center justify-center">
                                    <div
                                        className="w-full bg-black"
                                        style={{ height: `${lineThickness}px` }}
                                    />
                                </div>
                            </button>

                            {selectingThickness && (
                                <ul className="absolute z-10 bottom-full w-full bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((thickness) => (
                                        <li
                                            key={thickness}
                                            onClick={() => {
                                                setLineThickness(thickness);
                                                setSelectingThickness(false);
                                            }}
                                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center"
                                        >
                                            <div
                                                className="bg-black w-full"
                                                style={{ height: `${thickness}px` }}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
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