type InstallPrompt = Event & { prompt: () => Promise<void> };

export function setupInstall(button: HTMLButtonElement): void {
  let waiting: InstallPrompt | null = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    waiting = event as InstallPrompt;
    button.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    waiting = null;
    button.hidden = true;
  });

  button.addEventListener('click', async () => {
    const prompt = waiting;
    if (!prompt) return;
    waiting = null;
    button.hidden = true;
    await prompt.prompt();
  });
}
