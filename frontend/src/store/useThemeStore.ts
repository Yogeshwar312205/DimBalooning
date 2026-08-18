import { create } from 'zustand';

export type Theme = 'dark' | 'light';

interface ThemeStore {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'dark',

  initTheme: () => {
    const savedTheme = (localStorage.getItem('dim_ballooning_theme') as Theme) || 'dark';
    set({ theme: savedTheme });
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  },

  toggleTheme: () => {
    const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(nextTheme);
  },

  setTheme: (theme: Theme) => {
    localStorage.setItem('dim_ballooning_theme', theme);
    set({ theme });
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  }
}));
