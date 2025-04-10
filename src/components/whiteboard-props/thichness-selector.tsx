import { useState } from "react";

type ThicknessSelectorProps = {
    lineThickness: number;
    setLineThickness: (value: number) => void;
};

const ThicknessSelector: React.FC<ThicknessSelectorProps> = ({ lineThickness, setLineThickness }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative inline-block hover:scale-105 transition-transform duration-200">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="border border-gray-300 rounded px-4 py-1 bg-white text-black flex items-center justify-between min-w-[80px]"
            >
                <div className="w-full h-4 flex items-center justify-center">
                    <div
                        className="w-full bg-black"
                        style={{ height: `${lineThickness}px` }}
                    />
                </div>
            </button>

            {isOpen && (
                <ul className="absolute z-10 bottom-full w-full bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((thickness) => (
                        <li
                            key={thickness}
                            onClick={() => {
                                setLineThickness(thickness);
                                setIsOpen(false);
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
    );
};

export default ThicknessSelector;
