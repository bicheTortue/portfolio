// Add a page by creating its HTML file and adding one entry to this list.
const SITE_TABS = [
  { label: 'Overview', number: '01', file: 'index.html' },
  { label: 'Research', number: '02', file: 'research.html' },
  { label: 'Publications', number: '03', file: 'publications.html', publications: true },
  { label: 'CV', number: '04', file: 'cv.html' },
  { label: 'Contact', number: '05', file: 'contact.html' }
];

const currentFile = location.pathname.split('/').pop() || 'index.html';
const navigation = document.getElementById('site-nav');
const profile = window.SITE_PROFILE;
const portrait = document.querySelector('[data-profile-image]');
if (portrait) portrait.alt = `Portrait of ${profile.name}`;
const pageTitle = document.body.dataset.pageTitle || 'Portfolio';
document.title = `${pageTitle} | ${profile.name}`;
const description = document.querySelector('meta[name="description"]');
if (description) description.content = `${profile.name} — ${profile.role}. ${pageTitle}, research, and contact information.`;

document.querySelectorAll('[data-profile-text]').forEach(element => {
  const value = profile[element.dataset.profileText];
  if (value) element.textContent = value;
});
document.querySelectorAll('[data-profile-href]').forEach(element => {
  const value = profile[element.dataset.profileHref];
  if (value) {
    element.href = value;
    element.hidden = false;
  }
  else if (element.dataset.profileHref === 'universityUrl') {
    element.removeAttribute('href');
    element.classList.remove('text-accent', 'underline', 'decoration-accent/30', 'underline-offset-4');
  } else if (element.hasAttribute('data-profile-social')) {
    element.hidden = true;
  }
});
document.querySelectorAll('[data-profile-email-link]').forEach(element => {
  const subject = element.dataset.emailSubject;
  element.href = `mailto:${profile.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
});

SITE_TABS.forEach(tab => {
  const link = document.createElement('a');
  link.href = tab.file;
  link.className = `tab-button nav-link${tab.file === currentFile ? ' active-tab' : ''}`;
  if (tab.file === currentFile) link.setAttribute('aria-current', 'page');
  const number = document.createElement('span');
  number.textContent = tab.number;
  link.append(number, document.createTextNode(tab.label));
  if (tab.publications) {
    const count = document.createElement('span');
    count.id = 'publication-count';
    count.className = 'ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-muted';
    count.textContent = '…';
    link.append(count);
  }
  navigation.append(link);
});

document.getElementById('menu-toggle').addEventListener('click', event => {
  const open = navigation.classList.toggle('mobile-open');
  event.currentTarget.setAttribute('aria-expanded', String(open));
});
document.getElementById('year').textContent = new Date().getFullYear();

// Papers are refreshed by GitHub Actions and served as a static JSON file.
const AUTHOR_ID = profile.semanticScholarAuthorId;

async function fetchPublications() {
  const list = document.getElementById('publications');
  const latest = document.getElementById('latest-publications');
  const summary = document.getElementById('publication-summary');
  if (!list && !latest) return;

  try {
    const response = await fetch('data/publications.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Publication cache returned ${response.status}`);
    const result = await response.json();
    const papers = Array.isArray(result.papers) ? result.papers : [];
    const count = document.getElementById('publication-count');
    if (count) count.textContent = String(papers.length);
    if (summary) {
      const updated = result.generatedAt ? new Date(result.generatedAt) : null;
      const updatedText = updated && !Number.isNaN(updated.valueOf())
        ? ` · Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(updated)}`
        : '';
      summary.textContent = result.generatedAt
        ? `${papers.length} ${papers.length === 1 ? 'paper' : 'papers'}${updatedText}`
        : 'Waiting for the first GitHub Actions refresh';
    }

    const render = (container, items, compact) => {
      container.replaceChildren();
      if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'py-6 text-sm text-muted';
        empty.textContent = result.generatedAt
          ? 'No publications were found for this author yet.'
          : 'The publication list will appear after the first GitHub Actions refresh.';
        container.append(empty);
        return;
      }
      items.forEach(paper => {
        const article = document.createElement('article');
        article.className = compact ? 'rounded-xl border border-line bg-white p-5' : 'paper-row';
        const title = document.createElement('h3');
        title.className = 'paper-title';
        const link = document.createElement('a');
        link.textContent = paper.title || 'Untitled paper';
        link.href = paper.url || `https://www.semanticscholar.org/author/${AUTHOR_ID}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        title.append(link);
        const authors = document.createElement('p');
        authors.className = 'paper-meta';
        authors.textContent = `${(paper.authors || []).map(author => author.name).filter(Boolean).join(', ')}${paper.year ? ` · ${paper.year}` : ''}`;
        const venue = document.createElement('p');
        venue.className = 'paper-meta';
        venue.textContent = paper.venue || 'Preprint / Journal';
        article.append(title, authors, venue);
        if (compact) {
          const tag = document.createElement('span');
          tag.className = 'paper-tag';
          tag.textContent = 'Publication';
          article.append(tag);
        }
        container.append(article);
      });
    };
    if (list) render(list, papers, false);
    if (latest) render(latest, papers.slice(0, 3), true);
  } catch (error) {
    console.error('Could not load publications:', error);
    const count = document.getElementById('publication-count');
    if (count) count.textContent = '—';
    if (summary) summary.textContent = 'The saved publication list could not be loaded right now.';
    [list, latest].filter(Boolean).forEach(container => {
      const message = document.createElement('p');
      message.className = 'py-6 text-sm text-muted';
      message.append('Unable to load the saved publication list. Please visit my ');
      const profile = document.createElement('a');
      profile.className = 'text-accent underline';
      profile.href = `https://www.semanticscholar.org/author/${AUTHOR_ID}`;
      profile.target = '_blank';
      profile.rel = 'noreferrer';
      profile.textContent = 'Semantic Scholar profile';
      message.append(profile, '.');
      container.replaceChildren(message);
    });
  }
}

fetchPublications();
