import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { LocalService } from './services/local.service';
import { iNavigation } from './services/iNavigation';
import { Login, ChatPage } from '../models/constant';

export const authGuard: CanActivateFn = (route, state) => {
  const local = inject(LocalService);
  const nav = inject(iNavigation);

  if (local.isLoggedIn()) {
    return true;
  } else {
    nav.navigate(Login, null);
    return false;
  }
};

export const guestGuard: CanActivateFn = (route, state) => {
  const local = inject(LocalService);
  const nav = inject(iNavigation);

  if (local.isLoggedIn()) {
    nav.navigate(ChatPage, null);
    return false;
  }
  return true;
};
