import { SUPABASE_AUTH, SUPABASE_KEY, SUPABASE_URL, AUTH_HEADERS, HEADERS } from './api';
import { app } from './app.svelte';
import { SoundFx } from './sound';

/** Staff sign-in against Supabase Auth (password grant). Ported from legacy handleLogin. */
export async function login(email: string, password: string, remember: boolean) {
  app.toast('Signing in...', 'info');
  try {
    const cleanEmail = email.trim().toLowerCase();
    let profile = app.allStaff.find((s) => s.email && s.email.toLowerCase() === cleanEmail);
    const res = await fetch(`${SUPABASE_AUTH}/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error_description || err.message || 'Invalid email or password');
    }
    const auth = await res.json();
    const userId: string | undefined = auth.user?.id;
    if (!profile && userId) profile = app.allStaff.find((s) => s.id === userId);

    const user = {
      id: userId || profile?.id,
      name: profile?.name || auth.user?.user_metadata?.name || cleanEmail.split('@')[0],
      email: cleanEmail,
      role: profile?.role || 'staff',
      location_id: profile?.location_id || null,
    };
    app.currentUser = user;
    app.persistUser(user, remember);
    SoundFx.success();
    app.authOpen = false;
    app.toast(`Welcome back, ${user.name}!`, 'success');
    if (user.location_id) app.fromId = user.location_id;
    return true;
  } catch (e: any) {
    console.error('Login failed:', e);
    app.toast(e.message, 'error');
    SoundFx.warning();
    return false;
  }
}

/** Create a confirmed staff account (Auth admin API) + profile row. */
export async function signUp(fullName: string, email: string, password: string, role: string, branchId: string) {
  app.toast('Creating staff account in Supabase...', 'info');
  try {
    const cleanEmail = email.trim().toLowerCase();
    const createRes = await fetch(`${SUPABASE_AUTH}/admin/users`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { name: fullName, role, location_id: branchId },
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(err.message || 'Failed to create user in auth system');
    }
    const newUser = await createRes.json();
    await fetch(`${SUPABASE_URL}/profiles`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        id: newUser.id,
        name: fullName,
        email: cleanEmail,
        role,
        location_id: branchId || null,
        is_active: true,
      }),
    });
    await app.fetchStaff();
    SoundFx.success();
    app.toast(`Staff account for ${fullName} created successfully!`, 'success');
    app.authPrefillEmail = cleanEmail;
    app.authTab = 'login';
    return true;
  } catch (e: any) {
    console.error('Sign up failed:', e);
    app.toast('Error creating staff: ' + e.message, 'error');
    SoundFx.warning();
    return false;
  }
}

/** Instant password reset through the Auth admin API. */
export async function resetPassword(email: string, newPassword: string) {
  app.toast('Updating password in Supabase...', 'info');
  try {
    const cleanEmail = email.trim().toLowerCase();
    const listRes = await fetch(`${SUPABASE_AUTH}/admin/users`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const list = await listRes.json();
    const user = (list.users || []).find((u: any) => u.email && u.email.toLowerCase() === cleanEmail);
    if (!user) throw new Error(`Staff member with email "${cleanEmail}" not found in database.`);

    const upd = await fetch(`${SUPABASE_AUTH}/admin/users/${user.id}`, {
      method: 'PUT',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ password: newPassword }),
    });
    if (!upd.ok) {
      const err = await upd.json();
      throw new Error(err.message || 'Failed to update password');
    }
    SoundFx.success();
    app.toast(`Password for ${cleanEmail} updated successfully!`, 'success');
    app.authPrefillEmail = cleanEmail;
    app.authTab = 'login';
    return true;
  } catch (e: any) {
    console.error('Reset password failed:', e);
    app.toast(e.message, 'error');
    SoundFx.warning();
    return false;
  }
}
