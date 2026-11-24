'use strict';

const byId = (id) => document.getElementById(id);
const value = (id) => byId(id).value;
let toastTimer;

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new Error(`Could not reach the API. Check the frontend/API route and network connection. ${error.message}`);
  }

  const responseText = await response.text();
  let data = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }
  }

  if (!response.ok) {
    const detail = typeof data === 'string'
      ? data
      : data?.message || data?.error || JSON.stringify(data ?? `HTTP ${response.status}`);
    throw new Error(`Request failed (${response.status}): ${detail}`);
  }

  return data;
}

function formatResponse(data) {
  if (typeof data === 'string') return data;
  if (data === null || data === undefined) return 'Request completed. The API returned an empty response.';
  return JSON.stringify(data, null, 2);
}

function showToast(message, type = 'success') {
  const toast = byId('toast');
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function setResult(resultId, statusId, data, state = 'success') {
  const panel = byId(`${resultId}Panel`);
  panel.dataset.state = state;
  byId(statusId).textContent = state === 'success'
    ? 'Request completed'
    : state === 'error'
      ? 'Request failed'
      : state === 'loading'
        ? 'Request in progress'
        : 'Response preview';
  byId(resultId).textContent = formatResponse(data);
}

function validateFields(ids) {
  for (const id of ids) {
    const input = byId(id);
    if (!input.value.trim()) {
      input.focus();
      input.reportValidity();
      return false;
    }
    if (!input.checkValidity()) {
      input.focus();
      input.reportValidity();
      return false;
    }
  }
  return true;
}

async function runAction(buttonId, resultId, statusId, loadingText, action) {
  const button = byId(buttonId);
  const originalContent = button.innerHTML;
  button.disabled = true;
  button.textContent = loadingText;
  setResult(resultId, statusId, 'Sending request…', 'loading');

  try {
    const data = await action();
    setResult(resultId, statusId, data, 'success');
    showToast('Request completed successfully.');
    return data;
  } catch (error) {
    setResult(resultId, statusId, error.message || 'An unexpected error occurred.', 'error');
    showToast(error.message || 'Request failed.', 'error');
    return null;
  } finally {
    button.disabled = false;
    button.innerHTML = originalContent;
  }
}

async function register() {
  if (!validateFields(['username', 'email', 'password'])) return;
  return runAction('registerBtn', 'authResult', 'authStatus', 'Registering…', () =>
    requestJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: value('username').trim(),
        email: value('email').trim(),
        password: value('password')
      })
    })
  );
}

async function login() {
  if (!validateFields(['username', 'password'])) return;
  return runAction('loginBtn', 'authResult', 'authStatus', 'Signing in…', async () => {
    const data = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: value('username').trim(),
        password: value('password')
      })
    });
    if (data && typeof data === 'object' && data.userId !== undefined) {
      byId('userId').value = data.userId;
    }
    return data;
  });
}

async function createUser() {
  if (!validateFields(['userId', 'firstName', 'lastName', 'phone', 'address'])) return;
  return runAction('createUserBtn', 'userResult', 'userStatus', 'Creating…', () =>
    requestJson('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        userId: Number(value('userId')),
        firstName: value('firstName').trim(),
        lastName: value('lastName').trim(),
        phone: value('phone').trim(),
        address: value('address').trim()
      })
    })
  );
}

async function loadUsers() {
  return runAction('loadUsersBtn', 'userResult', 'userStatus', 'Loading…', () =>
    requestJson('/api/users')
  );
}

async function createItem() {
  if (!validateFields(['itemName', 'itemDescription', 'itemPrice', 'itemQuantity'])) return;
  return runAction('createItemBtn', 'itemResult', 'itemStatus', 'Adding item…', () =>
    requestJson('/api/items', {
      method: 'POST',
      body: JSON.stringify({
        name: value('itemName').trim(),
        description: value('itemDescription').trim(),
        price: Number(value('itemPrice')),
        quantity: Number(value('itemQuantity'))
      })
    })
  );
}

async function loadItems() {
  return runAction('loadItemsBtn', 'itemResult', 'itemStatus', 'Loading…', () =>
    requestJson('/api/items')
  );
}

function setupNavigation() {
  const links = [...document.querySelectorAll('.nav-link')];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => {
      const active = link.getAttribute('href') === `#${visible.target.id}`;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-18% 0px -65% 0px', threshold: [0, 0.15, 0.4] });

  sections.forEach((section) => observer.observe(section));
}

function setupPasswordToggle() {
  const toggle = byId('togglePassword');
  const password = byId('password');
  toggle.addEventListener('click', () => {
    const showing = password.type === 'text';
    password.type = showing ? 'password' : 'text';
    toggle.textContent = showing ? 'Show' : 'Hide';
    toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    toggle.setAttribute('aria-pressed', String(!showing));
  });
}

function setupCopyButtons() {
  document.querySelectorAll('[data-copy-target]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = byId(button.dataset.copyTarget);
      const content = target.textContent.trim();
      if (!content || content.endsWith('will appear here.') || content.endsWith('appear here.')) {
        showToast('There is no response to copy yet.', 'error');
        return;
      }
      try {
        await navigator.clipboard.writeText(content);
        showToast('Response copied to clipboard.');
      } catch {
        showToast('Clipboard access is unavailable in this browser context.', 'error');
      }
    });
  });
}

function initialize() {
  byId('registerBtn').addEventListener('click', register);
  byId('loginBtn').addEventListener('click', login);
  byId('createUserBtn').addEventListener('click', createUser);
  byId('loadUsersBtn').addEventListener('click', loadUsers);
  byId('createItemBtn').addEventListener('click', createItem);
  byId('loadItemsBtn').addEventListener('click', loadItems);
  byId('currentYear').textContent = new Date().getFullYear();
  setupPasswordToggle();
  setupCopyButtons();
  setupNavigation();
}

// Keep the original action names available for browser-console use and existing integrations.
window.register = register;
window.login = login;
window.createUser = createUser;
window.loadUsers = loadUsers;
window.createItem = createItem;
window.loadItems = loadItems;

document.addEventListener('DOMContentLoaded', initialize);
