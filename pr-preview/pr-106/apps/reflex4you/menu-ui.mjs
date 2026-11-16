export function setupMenuDropdown({ menuButton, menuDropdown, onAction }) {
  if (!menuButton || !menuDropdown) {
    return () => {};
  }

  function focusFirstMenuItem() {
    const firstItem = menuDropdown?.querySelector?.('[data-menu-action]');
    if (firstItem) {
      firstItem.focus({ preventScroll: true });
    }
  }

  function setMenuOpen(isOpen) {
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuDropdown.classList.toggle('menu-dropdown--open', Boolean(isOpen));
    menuDropdown.setAttribute('aria-hidden', String(!isOpen));
  }

  function isMenuOpen() {
    return Boolean(menuDropdown?.classList?.contains?.('menu-dropdown--open'));
  }

  setMenuOpen(false);

  const onMenuButtonClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextState = !isMenuOpen();
    setMenuOpen(nextState);
    if (nextState) {
      focusFirstMenuItem();
    }
  };

  const onDocPointerDown = (event) => {
    if (!menuDropdown.contains(event.target) && !menuButton.contains(event.target)) {
      setMenuOpen(false);
    }
  };

  const onDocKeyDown = (event) => {
    if (event.key === 'Escape' && isMenuOpen()) {
      setMenuOpen(false);
      menuButton.focus();
    }
  };

  const onMenuClick = (event) => {
    const actionButton = event.target?.closest?.('[data-menu-action]');
    if (!actionButton) {
      return;
    }
    try {
      onAction?.(String(actionButton.dataset.menuAction || ''));
    } finally {
      setMenuOpen(false);
    }
  };

  menuButton.addEventListener('click', onMenuButtonClick);
  document.addEventListener('pointerdown', onDocPointerDown);
  document.addEventListener('keydown', onDocKeyDown);
  menuDropdown.addEventListener('click', onMenuClick);

  return () => {
    try {
      menuButton.removeEventListener('click', onMenuButtonClick);
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
      menuDropdown.removeEventListener('click', onMenuClick);
    } catch (_) {
      // ignore
    }
  };
}

