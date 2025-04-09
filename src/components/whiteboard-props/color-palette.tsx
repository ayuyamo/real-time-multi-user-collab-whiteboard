const ColorPalette: React.FC<{ onSelectColor: (color: string) => void }> = ({ onSelectColor }) => {
    const colors = [
        '#ff4500', // orange red
        '#ffa500', // orange
        '#ff7f50', // coral
        '#fa8072', // salmon
        '#ffbf00', // amber
        '#ffd700', // gold
        '#ffdab9', // peach
        '#ffe4b5', // moccasin
        '#f0e68c', // khaki
        '#f5f5dc', // beige
        '#d2b48c', // tan
        '#a0522d', // sienna
        '#d2691e', // chocolate
        '#704214', // sepia
        '#800000', // maroon
        '#dc143c', // crimson
        '#ff66cc', // rose
        '#ff00ff', // magenta
        '#da70d6', // orchid
        '#9932cc', // dark orchid
        '#dda0dd', // plum
        '#e6e6fa', // lavender
        '#ccccff', // periwinkle
        '#87ceeb', // sky blue
        '#007fff', // azure
        '#000080', // navy
        '#40e0d0', // turquoise
        '#20b2aa', // light sea green
        '#008080', // teal
        '#00ffff', // aqua
        '#98ff98', // mint
        '#32cd32', // lime green
        '#7fff00', // chartreuse
        '#808000', // olive
        '#c0c0c0', // silver
    ];

    return (
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-white p-4 rounded shadow grid grid-cols-5 gap-2">
            {colors.map((color) => (
                <button
                    key={color}
                    className="w-8 h-8 rounded-full border-2 border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    onClick={() => onSelectColor(color)}
                ></button>
            ))}
        </div>
    );
};

export default ColorPalette;