const STORAGE_KEY = 'ptown:operations:transactions';

// Helper function to get the correct API base URL
const getApiUrl = (endpoint) => {
  // In development, use the proxy or fallback to direct backend URL
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev && window.location.port === '3000') {
    // Try proxy first, fallback to direct backend
    return endpoint;
  }
  return endpoint;
};

export async function fetchOperations() {
  try {
    const res = await fetch(getApiUrl('/api/operations'));
    if (!res.ok) throw new Error('Server fetch failed');
    return await res.json();
  } catch (err) {
    // Do not fallback to localStorage for operations to avoid local-only business data
    console.error('fetchOperations failed and local fallback is disabled:', err);
    return [];
  }
}

export async function addOperation(item) {
  try {
    const res = await fetch(getApiUrl('/api/operations'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
    if (!res.ok) throw new Error('Server write failed');
    const json = await res.json();
    return json;
  } catch (err) {
    // Do not persist operations locally; surface the error to the caller
    console.error('addOperation failed; local fallback disabled:', err);
    throw err;
  }
}

export async function deleteOperation(id) {
  try {
    const res = await fetch(getApiUrl(`/api/operations/${id}`), { method: 'DELETE' });
    if (!res.ok) throw new Error('Server delete failed');
    return true;
  } catch (err) {
    console.error('deleteOperation failed; local fallback disabled:', err);
    throw err;
  }
}

export async function updateOperation(id, patch) {
  try {
    const res = await fetch(getApiUrl(`/api/operations/${id}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (!res.ok) throw new Error('Server update failed');
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('updateOperation failed; local fallback disabled:', err);
    throw err;
  }
}

export async function aiSuggest(context) {
  try {
    // include recent transactions and goals if available in context
    const payload = { context };
    const res = await fetch(getApiUrl('/api/operations/ai-suggest'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error('AI suggest failed');
    const json = await res.json();
    return json.suggestions || [];
  } catch (err) {
    return [];
  }
}

export async function getGoals() {
  try {
    const res = await fetch(getApiUrl('/api/operations/goals'));
    if (!res.ok) throw new Error('Failed to fetch goals');
    return await res.json();
  } catch (err) {
    console.error('getGoals failed and local fallback disabled:', err);
    return { monthlyRevenue: 0, recoupTarget: 0 };
  }
}

export async function setGoals(goals) {
  try {
    const res = await fetch(getApiUrl('/api/operations/goals'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(goals) });
    if (!res.ok) throw new Error('Failed to set goals');
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('setGoals failed; local fallback disabled:', err);
    // Surface the error to caller
    throw err;
  }
}

export default { fetchOperations, addOperation, deleteOperation, updateOperation, aiSuggest, getGoals, setGoals };
