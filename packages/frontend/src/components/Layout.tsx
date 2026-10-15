import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Nav, Navbar, Offcanvas, Button } from 'react-bootstrap';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'react-toastify';

const navItems = [
  { to: '/dashboard', icon: 'bi-speedometer2', label: 'Overview' },
  { to: '/integrations', icon: 'bi-plug', label: 'Integrations' },
  { to: '/automations', icon: 'bi-gear-wide-connected', label: 'Automations' },
  { to: '/executions', icon: 'bi-list-task', label: 'Executions' },
  { to: '/incidents', icon: 'bi-exclamation-triangle', label: 'Incidents' },
  { to: '/security', icon: 'bi-shield-check', label: 'Security Center' },
  { to: '/backups', icon: 'bi-cloud-upload', label: 'Backups' },
  { to: '/documents', icon: 'bi-file-text', label: 'Documentation' },
  { to: '/performance', icon: 'bi-graph-up', label: 'Performance' },
  { to: '/audit', icon: 'bi-journal-text', label: 'Audit Logs' },
  { to: '/settings', icon: 'bi-building-gear', label: 'Org Settings' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showMobile, setShowMobile] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out');
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="d-flex flex-column h-100">
      <div className="px-3 py-3 border-bottom">
        <div className="fw-bold text-primary">🔧 Ops Platform</div>
        <div className="small text-muted mt-1">{user?.firstName} {user?.lastName}</div>
      </div>
      <Nav className="flex-column px-2 py-2 flex-grow-1 overflow-auto">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `nav-link rounded px-3 py-2 mb-1 d-flex align-items-center gap-2 ${isActive ? 'active bg-primary text-white' : 'text-dark'}`
            }
            onClick={() => setShowMobile(false)}
          >
            <i className={`bi ${item.icon}`}></i>
            {item.label}
          </NavLink>
        ))}
      </Nav>
      <div className="border-top px-3 py-3">
        <Button variant="outline-danger" size="sm" className="w-100" onClick={handleLogout}>
          <i className="bi bi-box-arrow-right me-2"></i>Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="d-flex" style={{ minHeight: '100vh' }}>
      {/* Desktop sidebar */}
      <div className="d-none d-lg-flex flex-column border-end bg-light" style={{ width: 240, minHeight: '100vh', position: 'sticky', top: 0 }}>
        <SidebarContent />
      </div>

      {/* Mobile navbar */}
      <Navbar bg="white" className="d-lg-none w-100 border-bottom position-fixed top-0 start-0" style={{ zIndex: 1030 }}>
        <div className="d-flex w-100 align-items-center px-3">
          <Button variant="link" className="p-0 text-dark" onClick={() => setShowMobile(true)}>
            <i className="bi bi-list fs-4"></i>
          </Button>
          <span className="fw-bold ms-3 text-primary">🔧 Ops Platform</span>
        </div>
      </Navbar>

      <Offcanvas show={showMobile} onHide={() => setShowMobile(false)} placement="start" style={{ width: 240 }}>
        <Offcanvas.Body className="p-0 h-100">
          <SidebarContent />
        </Offcanvas.Body>
      </Offcanvas>

      {/* Main content */}
      <main className="flex-grow-1 bg-white" style={{ minWidth: 0 }}>
        <div className="d-lg-none" style={{ height: 56 }} />
        <div className="p-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
