const api = {
  status: '/api/auth/status',
  login: '/api/auth/login',
  register: '/api/auth/register',
  logout: '/api/auth/logout',
  books: '/api/books'
};

async function request(path, options = {}) {
  try {
    const config = {
      ...options,
      url: path,
      headers: {
        ...options.headers,
      },
    };
    const response = await axios(config);
    return response.data;
  } catch (error) {
    const message = error.response?.data?.error || error.message || 'Request failed';
    throw new Error(message);
  }
}

async function loadAuthStatus() {
  return request(api.status);
}

function navigateTo(path) {
  window.location.href = path;
}

function buildNav(user) {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  nav.innerHTML = '';
  if (user) {
    const home = document.createElement('a');
    home.href = '/';
    home.textContent = 'Home';
    nav.appendChild(home);
    if (user.role === 'admin') {
      const admin = document.createElement('a');
      admin.href = '/admin.html';
      admin.textContent = 'Admin';
      nav.appendChild(admin);
    }
    const logout = document.createElement('a');
    logout.href = '#';
    logout.textContent = 'Logout';
    logout.addEventListener('click', async (event) => {
      event.preventDefault();
      await request(api.logout, { method: 'POST' });
      navigateTo('/login.html');
    });
    nav.appendChild(logout);
  } else {
    nav.innerHTML = '<a href="/login.html">Login</a> | <a href="/register.html">Register</a>';
  }
}

async function loadBooks() {
  const books = await request(api.books);
  const container = document.getElementById('books-list');
  if (!container) return;
  container.innerHTML = '';
  books.forEach((book) => {
    const card = document.createElement('article');
    card.className = 'book-card';
    card.innerHTML = `
      <div class="book-header-row">
        <div>
          <h3>${book.title}</h3>
          <p class="book-meta">${book.author}</p>
        </div>
        <span class="chip">${book.type ? book.type.toUpperCase() : 'TEXT'}</span>
      </div>
      <p class="book-description">${book.description || 'No description provided.'}</p>
      <div class="card-actions">
        <button class="button button-primary" data-id="${book.id}">Read book</button>
      </div>
    `;
    card.querySelector('button').addEventListener('click', () => {
      window.location.href = `/book.html?id=${book.id}`;
    });
    container.appendChild(card);
  });
}

function renderExcelContent(data) {
  if (!data || !Array.isArray(data.sheets)) {
    return '<p>No Excel content available.</p>';
  }
  return data.sheets
    .map((sheet) => {
      const rows = sheet.rows || [];
      if (!rows.length) return `<div class="excel-sheet"><h3>${sheet.name}</h3><p>No rows found.</p></div>`;
      const tableRows = rows
        .map(
          (row, rowIndex) => `
            <tr>
              ${row
                .map((cell) => `<td>${cell ?? ''}</td>`)
                .join('')}
            </tr>
          `
        )
        .join('');
      return `
        <div class="excel-sheet kindle-excel">
          <h3>${sheet.name}</h3>
          <div class="excel-scroll">
            <table>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
      `;
    })
    .join('');
}

async function loadBookDetails() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    document.getElementById('book-details').textContent = 'Book ID missing.';
    return;
  }
  const book = await request(`${api.books}/${id}`);
  document.getElementById('book-title').textContent = book.title;
  document.getElementById('book-details').innerHTML = `
    <div class="book-card">
      <h2>${book.title}</h2>
      <p><strong>Author:</strong> ${book.author}</p>
      <p>${book.description || 'No description provided.'}</p>
    </div>
  `;

  const contentArea = document.getElementById('book-content');
  if (book.type === 'pdf' && book.fileUrl) {
    contentArea.innerHTML = `
      <div class="reader-frame-card">
        <iframe class="reader-iframe" src="${book.fileUrl}"></iframe>
        <p class="reader-note">PDF viewer loaded. Use browser controls to navigate pages and zoom.</p>
      </div>
    `;
    return;
  }

  if (book.type === 'excel' && book.fileUrl) {
    contentArea.innerHTML = `<p>Loading Excel preview...</p>`;
    try {
      const data = await request(`${api.books}/${id}/data`);
      contentArea.innerHTML = renderExcelContent(data);
    } catch (err) {
      contentArea.innerHTML = `<p class="error">Unable to load Excel data. <a href="${book.fileUrl}" target="_blank">Download file</a></p>`;
    }
    return;
  }

  contentArea.textContent = book.content || 'No content available for this book.';
}

async function initIndex() {
  try {
    const auth = await loadAuthStatus();
    buildNav(auth.user);
  } catch (error) {
    console.error(error);
  }
  await loadBooks();
}

async function initLogin() {
  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const formData = new FormData(form);
    try {
      await request(api.login, {
        method: 'POST',
        data: {
          username: formData.get('username'),
          password: formData.get('password')
        }
      });
      navigateTo('/');
    } catch (err) {
      error.textContent = err.message;
    }
  });
}

async function initRegister() {
  const form = document.getElementById('register-form');
  const error = document.getElementById('register-error');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const formData = new FormData(form);
    try {
      await request(api.register, {
        method: 'POST',
        data: {
          username: formData.get('username'),
          password: formData.get('password')
        }
      });
      navigateTo('/');
    } catch (err) {
      error.textContent = err.message;
    }
  });
}

async function initAdmin() {
  try {
    const auth = await loadAuthStatus();
    if (!auth.user || auth.user.role !== 'admin') {
      navigateTo('/login.html');
      return;
    }
    buildNav(auth.user);
  } catch (error) {
    console.error(error);
    navigateTo('/login.html');
    return;
  }

  const form = document.getElementById('book-form');
  const error = document.getElementById('book-error');
  const success = document.getElementById('book-success');
  const fileInput = document.getElementById('file-input');
  const dropzone = document.getElementById('file-dropzone');
  const fileNameLabel = document.getElementById('dropzone-filename');

  function updateFileName() {
    const file = fileInput.files && fileInput.files[0];
    fileNameLabel.textContent = file ? file.name : 'No file selected';
  }

  function highlightDropzone(active) {
    dropzone.classList.toggle('dropzone-active', active);
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    highlightDropzone(true);
  });
  dropzone.addEventListener('dragleave', () => highlightDropzone(false));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    highlightDropzone(false);
    const droppedFiles = event.dataTransfer.files;
    if (droppedFiles.length) {
      fileInput.files = droppedFiles;
      updateFileName();
    }
  });

  fileInput.addEventListener('change', updateFileName);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    success.textContent = '';
    const submitData = new FormData(form);
    const progressBar = document.getElementById('upload-progress');
    const progressFill = progressBar.querySelector('.progress-fill');
    const submitBtn = document.getElementById('submit-btn');

    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';

    try {
      await request(api.books, {
        method: 'POST',
        data: submitData,
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          progressFill.style.width = `${percent}%`;
        }
      });
      success.textContent = 'Book uploaded successfully and backed up!';
      form.reset();
      updateFileName();
    } catch (err) {
      error.textContent = err.message;
    } finally {
      progressBar.style.display = 'none';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publish Book';
    }
  });
}

async function initBookPage() {
  try {
    const auth = await loadAuthStatus();
    if (!auth.user) {
      navigateTo('/login.html');
      return;
    }
  } catch {
    navigateTo('/login.html');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    document.getElementById('book-content').textContent = 'Book ID missing.';
    return;
  }

  const book = await request(`${api.books}/${id}`);
  document.getElementById('book-title').textContent = book.title;

  // Initialize reading settings
  initReadingSettings();

  const contentArea = document.getElementById('book-content');
  contentArea.classList.remove('fullscreen');
  if (book.type === 'pdf' && book.fileUrl) {
    contentArea.classList.add('fullscreen');
    contentArea.innerHTML = `
      <div class="pdf-container">
        <iframe class="kindle-pdf" src="${book.fileUrl}" frameborder="0"></iframe>
        <p class="pdf-note">📖 PDF opened in Kindle-style viewer. Use browser controls for navigation.</p>
      </div>
    `;
    updateProgress(100); // PDFs don't have scroll progress
    return;
  }

  if (book.type === 'excel' && book.fileUrl) {
    contentArea.innerHTML = `<p>Loading Excel preview...</p>`;
    try {
      const data = await request(`${api.books}/${id}/data`);
      contentArea.innerHTML = renderExcelContent(data);
      updateProgress(100);
    } catch (err) {
      contentArea.innerHTML = `<p class="error">Unable to load Excel data. <a href="${book.fileUrl}" target="_blank">Download file</a></p>`;
    }
    return;
  }

  // Handle text content
  contentArea.innerHTML = book.content || 'No content available for this book.';
  initTextReader();
}

function initReadingSettings() {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('reading-settings');
  const backBtn = document.getElementById('back-btn');
  const tocBtn = document.getElementById('toc-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');

  // Toggle settings panel
  settingsBtn.addEventListener('click', () => {
    settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
  });

  // Fullscreen toggle
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', async () => {
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen?.();
          fullscreenBtn.textContent = '⤫';
        } catch (err) {
          console.warn('Fullscreen request failed', err);
        }
      } else {
        try {
          await document.exitFullscreen?.();
          fullscreenBtn.textContent = '⛶';
        } catch (err) {
          console.warn('Exit fullscreen failed', err);
        }
      }
    });

    document.addEventListener('fullscreenchange', () => {
      fullscreenBtn.textContent = document.fullscreenElement ? '⤫' : '⛶';
    });
  }

  // Back button
  backBtn.addEventListener('click', () => {
    window.location.href = '/';
  });

  // TOC button (placeholder for now)
  tocBtn.addEventListener('click', () => {
    alert('Table of Contents feature coming soon!');
  });

  // Font size controls
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const size = btn.dataset.size;
      document.body.classList.remove('font-small', 'font-large');
      if (size !== 'medium') {
        document.body.classList.add(`font-${size}`);
      }
    });
  });

  // Theme controls
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const theme = btn.dataset.theme;
      document.body.classList.remove('theme-light', 'theme-sepia', 'theme-dark');
      document.body.classList.add(`theme-${theme}`);
    });
  });

  // Line spacing controls
  document.querySelectorAll('.spacing-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.spacing-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const spacing = btn.dataset.spacing;
      document.body.classList.remove('spacing-normal', 'spacing-wide');
      if (spacing !== 'normal') {
        document.body.classList.add(`spacing-${spacing}`);
      }
    });
  });
}

function initTextReader() {
  const contentWrapper = document.querySelector('.book-content-wrapper');
  const header = document.getElementById('reader-header');

  // Auto-hide header on scroll
  let scrollTimer;
  contentWrapper.addEventListener('scroll', () => {
    header.classList.remove('hidden');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (contentWrapper.scrollTop > 100) {
        header.classList.add('hidden');
      }
    }, 2000);
  });

  // Show header on mouse move near top
  document.addEventListener('mousemove', (e) => {
    if (e.clientY < 100) {
      header.classList.remove('hidden');
    }
  });

  // Update progress on scroll
  contentWrapper.addEventListener('scroll', updateScrollProgress);

  // Navigation buttons
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  prevBtn.addEventListener('click', () => {
    const scrollAmount = contentWrapper.clientHeight * 0.8;
    contentWrapper.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    const scrollAmount = contentWrapper.clientHeight * 0.8;
    contentWrapper.scrollBy({ top: scrollAmount, behavior: 'smooth' });
  });
}

function updateScrollProgress() {
  const contentWrapper = document.querySelector('.book-content-wrapper');
  const scrollTop = contentWrapper.scrollTop;
  const scrollHeight = contentWrapper.scrollHeight - contentWrapper.clientHeight;
  const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
  updateProgress(progress);
}

function updateProgress(percent) {
  const progressFill = document.getElementById('progress-fill');
  const currentLocation = document.getElementById('current-location');

  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
  if (currentLocation) {
    currentLocation.textContent = `${Math.round(percent)}%`;
  }
}

const path = window.location.pathname;
if (path === '/') {
  initIndex();
} else if (path.endsWith('/login.html')) {
  initLogin();
} else if (path.endsWith('/register.html')) {
  initRegister();
} else if (path.endsWith('/admin.html')) {
  initAdmin();
} else if (path.endsWith('/book.html')) {
  initBookPage();
}
