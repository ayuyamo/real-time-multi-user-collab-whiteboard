import supabase from './supabase-auth';

interface Stroke {
  uuid: string;
  drawing: {
    x: number;
    y: number;
  }[];
  color: string;
  lineWidth: number;
}
// Function to save a stroke
async function saveStroke({ uuid, drawing, color, lineWidth }: Stroke) {
  const { data, error } = await supabase.from('drawing-rooms').insert([
    {
      id: uuid,
      drawing: drawing,
      color: color,
      line_width: lineWidth,
      user_id: (await supabase.auth.getUser()).data.user?.id,
    },
  ]);

  if (error) {
    console.error('Error saving stroke:', error);
  } else {
    console.log('Stroke saved:', data);
  }
}

async function deleteLines(linesToDelete: string[]) {
  const { data, error } = await supabase
    .from('drawing-rooms')
    .delete()
    .in('id', linesToDelete);

  if (error) {
    console.error('Error deleting lines:', error);
  } else {
    console.log('Lines deleted');
  }
}

async function fetchLines(): Promise<Stroke[]> {
  const { data, error } = await supabase
    .from('drawing-rooms')
    .select('id, drawing, color, line_width');
  if (error) {
    console.error('Error fetching lines:', error.message);
    return []; // return an empty array in case of error
  } else {
    // Format the data to fit our structure
    const formattedLines: Stroke[] = data.map((item: any) => ({
      uuid: item.id, // unique id
      drawing: item.drawing, // array of points (Point[][])
      color: item.color, // color
      lineWidth: item.line_width, // line width
    }));
    return formattedLines; // return the formatted data
  }
}
export { saveStroke, deleteLines, fetchLines };
