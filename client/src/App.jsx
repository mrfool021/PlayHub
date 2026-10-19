import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { links, navigate, useRoute } from './router.js';
import AuthForm from './components/AuthForm.jsx';
import FollowList from './components/FollowList.jsx';
import Footer from './components/Footer.jsx';
import Icon from './components/Icons.jsx';
import Navbar, { Logo } from './components/Navbar.jsx';
import PollList from './components/PollList.jsx';
import PollView from './components/PollView.jsx';
import ProfileView from './components/ProfileView.jsx';
import SearchView from './components/SearchView.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted">
      <p role="status" className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        Loading&hellip;
      </p>
    </div>
  );
}

function LoggedOut() {
  const [authMode, setAuthMode] = useState('login');
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div className="text-center lg:text-left">
          <p className="section-title text-accent">The gaming community hub</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            Vote. Debate. <span className="text-gradient">Dominate.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-muted lg:mx-0">
            Create polls with screenshots, settle arguments in the comments and follow the players you trust.
          </p>
          <ul className="mx-auto mt-6 hidden max-w-md gap-3 text-left text-sm sm:grid">
            {[
              ['vote', 'Image-powered polls with live results'],
              ['message', 'Threaded comments with player avatars'],
              ['users', 'Follow players and build your squad feed'],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand">
                  <Icon name={icon} className="h-5 w-5" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <AuthForm
          key={authMode}
          mode={authMode}
          onSuccess={() => navigate(links.home())}
          onSwitchMode={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
        />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  const { user, checking, logout } = useAuth();
  const route = useRoute();

  if (checking) return <Splash />;
  if (!user) return <LoggedOut />;

  function handleLogout() {
    logout();
    navigate(links.home());
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar route={route} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* "#/new" shows the same page and moves the cursor into the create form */}
        {(route.name === 'list' || route.name === 'create') && <PollList focusForm={route.name === 'create'} />}
        {route.name === 'poll' && <PollView pollId={route.id} />}
        {route.name === 'search' && <SearchView query={route.q} />}
        {route.name === 'profile' && <ProfileView userId={route.id} />}
        {route.name === 'follows' && <FollowList userId={route.id} tab={route.tab} />}
      </main>

      {/* Thumb-reach "new poll" button for phones */}
      {route.name !== 'create' && (
        <a
          href={links.create()}
          aria-label="Create a new poll"
          className="btn-primary fixed bottom-5 right-5 z-30 !h-14 !w-14 !min-h-0 !rounded-full !p-0 sm:hidden"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Icon name="plus" className="h-6 w-6" />
        </a>
      )}

      <Footer />
    </div>
  );
}
