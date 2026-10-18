import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
  },
  {
    path: 'scripts',
    loadComponent: () =>
      import('./features/script-list/script-list.component').then((m) => m.ScriptListComponent)
  },
  {
    path: 'scripts/:id/run',
    loadComponent: () =>
      import('./features/script-run/script-run.component').then((m) => m.ScriptRunComponent)
  },
  {
    path: 'history',
    loadComponent: () =>
      import('./features/history/history.component').then((m) => m.HistoryComponent)
  },
  {
    path: 'cookies',
    loadComponent: () =>
      import('./features/cookies/cookies.component').then((m) => m.CookiesComponent)
  }
];
