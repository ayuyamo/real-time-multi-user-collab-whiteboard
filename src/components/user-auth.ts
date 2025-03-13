import supabase from './supabase/supabase-auth';

async function signUpNewUser(userEmail: string, userPassword: string) {
  const { data, error } = await supabase.auth.signUp({
    email: userEmail,
    password: userPassword,
    options: {
      emailRedirectTo: 'http://localhost:3000/whiteboard', // Change to your redirect URL
    },
  });
  if (error) {
    console.error('Error signing up:', error.message);
    return { error: error.message };
  }
  if (data) {
    console.log('Sign up successful:', data);
    return data;
  }
}

async function signInWithEmail(userEmail: string, userPassword: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: userEmail,
    password: userPassword,
  });
  if (error) {
    if (error.message.includes('Email not confirmed')) {
      console.error('Email not confirmed. Please check your inbox.');
      return { error: 'Please confirm your email before signing in.' };
    }
    console.error('Error signing in:', error.message);
    return { error: error.message };
  }
  if (data) {
    console.log('Sign in successful:', data);
    return data;
  }
}

async function resetPassword(userEmail: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(userEmail, {
    redirectTo: 'http://localhost:3000/auth/reset-password', // Change to your reset page
  });

  if (error) {
    console.error('Error sending password reset email:', error.message);
    return { error: error.message };
  }

  console.log('Password reset email sent successfully.');
  return data;
}

async function signInWithProvider(provider: 'google' | 'github') {
  // TODO: Have to change the supabase settings to enable these providers
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: 'http://localhost:3000/auth/callback', // Change to your redirect URL
    },
  });

  if (error) {
    console.error(`Error signing in with ${provider}:`, error.message);
    return { error: error.message };
  }

  console.log(`Sign in with ${provider} successful`, data);
  return data;
}

async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error.message);
    return { error: error.message };
  }
  console.log('Sign out successful.');
}

export {
  signUpNewUser,
  signInWithEmail,
  resetPassword,
  signInWithProvider,
  signOutUser,
};
