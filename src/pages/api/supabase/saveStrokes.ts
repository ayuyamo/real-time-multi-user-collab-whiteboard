import supabase from './supabase-auth';

interface Stroke {
  drawing: { x: number; y: number }[];
  name: string;
}
// Function to save a stroke
async function saveStroke({ drawing, name }: Stroke) {
  const { data, error } = await supabase
    .from('drawing-rooms')
    .insert([{ drawing: drawing, name: name }]);

  if (error) {
    console.error('Error saving stroke:', error);
  } else {
    console.log('Stroke saved:', data);
  }
}
export default saveStroke;
