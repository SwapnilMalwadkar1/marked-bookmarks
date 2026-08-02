import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('marked-theme', theme);
  const dark = theme === 'dark';
  const button = document.querySelector('#themeToggle');
  button.textContent = dark ? '☀' : '☾';
  button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}
applyTheme(localStorage.getItem('marked-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
document.querySelector('#themeToggle').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

const supabase = createClient(window.MARKED_SUPABASE_URL, window.MARKED_SUPABASE_KEY);
const grid = document.querySelector('#bookmarkGrid');
const empty = document.querySelector('#emptyState');
const dialog = document.querySelector('#bookmarkDialog');
const form = document.querySelector('#bookmarkForm');
const addButton = document.querySelector('#openModal');
const emptyAddButton = document.querySelector('#emptyAdd');
let bookmarks = [];
let user = null;
let editingId = null;
let draggedId = null;

const knownSites = [
  ['YouTube', 'https://www.youtube.com'], ['Google', 'https://www.google.com'], ['Gmail', 'https://mail.google.com'],
  ['GitHub', 'https://github.com'], ['Instagram', 'https://www.instagram.com'], ['LinkedIn', 'https://www.linkedin.com'],
  ['Notion', 'https://www.notion.so'], ['Netflix', 'https://www.netflix.com'], ['Spotify', 'https://open.spotify.com'],
  ['WhatsApp', 'https://web.whatsapp.com'], ['X', 'https://x.com'], ['ChatGPT', 'https://chatgpt.com']
];

function host(url) { try { return new URL(url).hostname.replace('www.', ''); } catch { return url || 'No website address'; } }
function setSignedInState() {
  const signedIn = Boolean(user);
  addButton.disabled = !signedIn;
  emptyAddButton.disabled = !signedIn;
  document.querySelector('#signInButton').hidden = signedIn;
  document.querySelector('#accountMenu').hidden = !signedIn;
  if (signedIn) document.querySelector('#accountName').textContent = user.user_metadata?.full_name || user.email || 'Signed in';
}

async function loadBookmarks() {
  if (!user) { bookmarks = []; render(); return; }
  const { data, error } = await supabase.from('bookmarks').select('*').order('is_pinned', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (error) {
    console.error(error);
    document.querySelector('#collectionDescription').textContent = 'Create the bookmarks table in Supabase to start saving.';
    bookmarks = [];
  } else bookmarks = data;
  render();
}

function render() {
  const query = document.querySelector('#searchInput').value.toLowerCase();
  const filter = document.querySelector('#categoryFilter'); const selectedCategory = filter.value;
  const categories = [...new Set(['All categories', 'Favorites', 'Work', 'Learning', 'Entertainment', 'Shopping', 'Social', ...bookmarks.map(bookmark => bookmark.category).filter(Boolean)])];
  filter.replaceChildren(...categories.map(category => { const option = document.createElement('option'); option.textContent = category; return option; }));
  filter.value = categories.includes(selectedCategory) ? selectedCategory : 'All categories';
  const sorted = [...bookmarks].filter(bookmark => ((bookmark.name || 'Untitled bookmark').toLowerCase().includes(query) || host(bookmark.url).includes(query)) && (selectedCategory === 'All categories' || (bookmark.category || 'Favorites') === selectedCategory));
  if (document.querySelector('#sortSelect').value === 'az') sorted.sort((a, b) => (a.name || 'Untitled bookmark').localeCompare(b.name || 'Untitled bookmark'));
  else sorted.sort((a, b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) || (a.sort_order || 0) - (b.sort_order || 0));
  grid.replaceChildren();
  sorted.forEach(bookmark => {
    const card = document.querySelector('#cardTemplate').content.cloneNode(true);
    const name = bookmark.name?.trim() || 'Untitled bookmark';
    const cardElement = card.querySelector('.bookmark-card'); cardElement.dataset.id = bookmark.id;
    const link = card.querySelector('.card-link'); link.href = bookmark.url;
    const symbol = card.querySelector('.symbol');
    const initial = document.createElement('span'); initial.className = 'initial-badge'; initial.textContent = name[0].toUpperCase(); initial.setAttribute('aria-hidden', 'true');
    if (bookmark.logo) { const img = new Image(); img.src = bookmark.logo; img.alt = ''; img.onload = () => symbol.classList.add('has-logo'); img.onerror = () => img.remove(); symbol.append(img); }
    symbol.append(initial);
    card.querySelector('h3').textContent = name;
    card.querySelector('p').textContent = host(bookmark.url);
    card.querySelector('.category-tag').textContent = bookmark.category || 'Favorites';
    const pinButton = card.querySelector('.pin-button'); pinButton.textContent = bookmark.is_pinned ? 'Unpin' : 'Pin'; pinButton.classList.toggle('is-pinned', Boolean(bookmark.is_pinned));
    pinButton.onclick = async () => { const { error } = await supabase.from('bookmarks').update({ is_pinned: !bookmark.is_pinned }).eq('id', bookmark.id); if (error) return alert('Could not update this pin. Please run the database update first.'); await loadBookmarks(); };
    card.querySelector('.edit-button').onclick = () => openDialog(bookmark);
    card.querySelector('.delete-button').onclick = async () => {
      const { error } = await supabase.from('bookmarks').delete().eq('id', bookmark.id);
      if (error) return alert('Could not delete this bookmark. Please try again.');
      await loadBookmarks();
    };
    cardElement.addEventListener('dragstart', event => { draggedId = bookmark.id; event.dataTransfer.effectAllowed = 'move'; cardElement.classList.add('is-dragging'); });
    cardElement.addEventListener('dragend', () => { draggedId = null; cardElement.classList.remove('is-dragging'); });
    cardElement.addEventListener('dragover', event => { if (draggedId && draggedId !== bookmark.id) event.preventDefault(); });
    cardElement.addEventListener('drop', event => { event.preventDefault(); reorderBookmarks(draggedId, bookmark.id); });
    grid.append(card);
  });
  document.querySelector('#reorderHint').hidden = selectedCategory === 'All categories' || !user || sorted.length < 2;
  empty.hidden = bookmarks.length !== 0 || !user;
  grid.hidden = bookmarks.length === 0;
  document.querySelector('#bookmarkTotal').textContent = `${bookmarks.length} saved`;
  if (user) document.querySelector('#collectionDescription').textContent = bookmarks.length ? `${bookmarks.length} bookmark${bookmarks.length === 1 ? '' : 's'} in your collection.` : 'No bookmarks yet — add your first one.';
  if (!user) document.querySelector('#collectionDescription').textContent = 'Sign in with Google to save your personal bookmarks.';
}

function toggleCustomCategory() { const custom = document.querySelector('#bookmarkCategory').value === 'Custom'; document.querySelector('#customCategoryLabel').hidden = !custom; document.querySelector('#customCategory').required = custom; }
function openDialog(bookmark = null) {
  if (!user) return;
  editingId = bookmark?.id ?? null; form.reset();
  document.querySelector('#modalEyebrow').textContent = bookmark ? 'EDIT BOOKMARK' : 'NEW BOOKMARK';
  document.querySelector('#modalTitle').textContent = bookmark ? 'Update your favorite' : 'Add a favorite';
  document.querySelector('#saveButton').textContent = bookmark ? 'Save changes' : 'Save bookmark';
  if (bookmark) {
    document.querySelector('#bookmarkName').value = bookmark.name || ''; document.querySelector('#bookmarkUrl').value = bookmark.url || '';
    const known = [...document.querySelector('#bookmarkCategory').options].some(option => option.value === bookmark.category);
    document.querySelector('#bookmarkCategory').value = known ? bookmark.category : 'Custom'; document.querySelector('#customCategory').value = known ? '' : bookmark.category || ''; document.querySelector('#bookmarkLogo').value = bookmark.logo || '';
  }
  toggleCustomCategory(); dialog.showModal(); document.querySelector('#bookmarkName').focus();
}

function showSuggestions() {
  const typed = document.querySelector('#bookmarkName').value.trim().toLowerCase(); const suggestions = knownSites.filter(([name]) => typed && name.toLowerCase().includes(typed)).slice(0, 3);
  const box = document.querySelector('#siteSuggestions'); box.replaceChildren(); box.hidden = !typed; if (!typed) return;
  const label = document.createElement('div'); label.className = 'suggestion-label'; label.textContent = suggestions.length ? 'SUGGESTED WEBSITES' : 'FIND A WEBSITE'; box.append(label);
  suggestions.forEach(([name, url]) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'suggestion-button'; button.innerHTML = `<strong>${name}</strong><span>${host(url)}</span>`; button.onclick = () => { document.querySelector('#bookmarkName').value = name; document.querySelector('#bookmarkUrl').value = url; box.hidden = true; }; box.append(button); });
  const google = document.createElement('a'); google.className = 'suggestion-button google-search-link'; google.href = `https://www.google.com/search?q=${encodeURIComponent(`${typed} official website`)}`; google.target = '_blank'; google.rel = 'noopener noreferrer'; google.innerHTML = `<strong>Search Google for “${typed}”</strong><span>↗</span>`; box.append(google);
}

async function reorderBookmarks(fromId, toId) {
  const category = document.querySelector('#categoryFilter').value;
  if (!fromId || category === 'All categories') return alert('Choose one category before rearranging bookmarks.');
  const source = bookmarks.find(bookmark => bookmark.id === fromId); const target = bookmarks.find(bookmark => bookmark.id === toId);
  if (!source || !target || source.category !== category || target.category !== category) return;
  if (Boolean(source.is_pinned) !== Boolean(target.is_pinned)) return alert('Pinned bookmarks always stay above unpinned bookmarks.');
  const group = bookmarks.filter(bookmark => bookmark.category === category && Boolean(bookmark.is_pinned) === Boolean(source.is_pinned)).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const fromIndex = group.findIndex(bookmark => bookmark.id === fromId); const toIndex = group.findIndex(bookmark => bookmark.id === toId);
  group.splice(toIndex, 0, group.splice(fromIndex, 1)[0]);
  const changes = group.map((bookmark, index) => supabase.from('bookmarks').update({ sort_order: index }).eq('id', bookmark.id));
  const results = await Promise.all(changes);
  if (results.some(result => result.error)) return alert('Could not save the new order. Please run the database update first.');
  await loadBookmarks();
}

document.querySelector('#signInButton').onclick = async () => {
  if (location.protocol === 'file:') return alert('Google sign-in needs the site to be published first. We will deploy it to Vercel next.');
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  if (error) alert(`Could not start Google sign-in: ${error.message}`);
};
document.querySelector('#signOutButton').onclick = async () => { await supabase.auth.signOut(); };
document.querySelector('#openModal').onclick = openDialog; document.querySelector('#emptyAdd').onclick = openDialog;
document.querySelector('#closeModal').onclick = () => dialog.close(); document.querySelector('#cancelModal').onclick = () => dialog.close();
document.querySelector('#searchInput').oninput = render; document.querySelector('#categoryFilter').onchange = render; document.querySelector('#sortSelect').onchange = render;
document.querySelector('#bookmarkName').oninput = showSuggestions; document.querySelector('#bookmarkCategory').onchange = toggleCustomCategory;
form.addEventListener('submit', async event => {
  event.preventDefault(); if (!user) return;
  const data = new FormData(form); let url = data.get('url').trim(); if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const category = data.get('category') === 'Custom' ? data.get('customCategory').trim() : data.get('category');
  const details = { name: data.get('name').trim(), url, category, logo: data.get('logo').trim() || null };
  const request = editingId ? supabase.from('bookmarks').update(details).eq('id', editingId) : supabase.from('bookmarks').insert({ ...details, user_id: user.id });
  const { error } = await request; if (error) return alert(`Could not save bookmark: ${error.message}`);
  dialog.close(); await loadBookmarks();
});

supabase.auth.onAuthStateChange((_event, session) => { user = session?.user || null; setSignedInState(); loadBookmarks(); });
supabase.auth.getSession().then(({ data }) => { user = data.session?.user || null; setSignedInState(); loadBookmarks(); });
