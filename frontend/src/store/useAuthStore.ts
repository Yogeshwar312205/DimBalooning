import { create } from 'zustand';
import { User } from '../types/auth';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  initAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  initAuth: () => {
    const token = localStorage.getItem('dim_ballooning_token');
    const userStr = localStorage.getItem('dim_ballooning_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ token, user, isAuthenticated: true });
      } catch (err) {
        localStorage.removeItem('dim_ballooning_token');
        localStorage.removeItem('dim_ballooning_user');
      }
    }
  },

  login: (token: string, user: User) => {
    localStorage.setItem('dim_ballooning_token', token);
    localStorage.setItem('dim_ballooning_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('dim_ballooning_token');
    localStorage.removeItem('dim_ballooning_user');
    set({ token: null, user: null, isAuthenticated: false });
  }
}));
