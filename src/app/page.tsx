'use client';
import LoginPage from "./login/page";
import { useEffect, useState } from "react";
import supabase from '../pages/api/supabase/supabase-auth';
import Whiteboard from "./whiteboard/page";
const HomePage = () => {
  // Fetch user and assign color
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Listen for authentication state changes
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        console.log("User signed in:", session.user.id);
        setUser(session.user);
      } else {
        console.log("User signed out");
        setUser(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);
  return (
    <div>
      {user ? (<Whiteboard user={user} />) : (<LoginPage />)}
    </div>
  )
};
export default HomePage;