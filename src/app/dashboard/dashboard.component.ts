import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  isSidebarOpen = true;
  currentPage = 'Dashboard';

  menuItems = [{ name: 'Dashboard', icon: '📊', route: 'dashboard' }];

  stats = [
    { title: 'Total Users', value: '12,345', change: '+12%', isPositive: true },
    { title: 'Revenue', value: '$54,321', change: '+8%', isPositive: true },
    { title: 'Active Projects', value: '42', change: '+3%', isPositive: true },
    { title: 'Pending Tasks', value: '18', change: '-5%', isPositive: false },
  ];

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  selectMenuItem(item: any) {
    this.currentPage = item.name;
  }
}
