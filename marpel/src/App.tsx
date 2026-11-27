import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from './components/ui';
import { SessionProvider, StoreProvider, ToastProvider, useSession } from './lib/store';
import PublicLayout from './public/PublicLayout';
import Home from './public/pages/Home';
import About from './public/pages/About';
import { ServiceDetail, ServicesIndex } from './public/pages/Services';
import Portfolio from './public/pages/Portfolio';
import { BlogIndex, BlogPostPage } from './public/pages/Blog';
import Contact from './public/pages/Contact';
import Quote from './public/pages/Quote';
import Book from './public/pages/Book';
import Track from './public/pages/Track';
import ConversationPage from './public/pages/Conversation';
import NotFound from './public/pages/NotFound';

// Admin is code-split so public pages stay light and fast.
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const Login = lazy(() => import('./admin/Login'));
const Dashboard = lazy(() => import('./admin/Dashboard'));
const Inquiries = lazy(() => import('./admin/Inquiries'));
const InquiryDetail = lazy(() => import('./admin/InquiryDetail'));
const Chat = lazy(() => import('./admin/Chat'));
const Customers = lazy(() => import('./admin/Customers'));
const CustomerDetail = lazy(() => import('./admin/CustomerDetail'));
const ServicesAdmin = lazy(() => import('./admin/ServicesAdmin'));
const PortfolioAdmin = lazy(() => import('./admin/PortfolioAdmin'));
const BlogAdmin = lazy(() => import('./admin/BlogAdmin'));
const Quotations = lazy(() => import('./admin/Quotations'));
const QuotationEditor = lazy(() => import('./admin/QuotationEditor'));
const Projects = lazy(() => import('./admin/Projects'));
const ProjectDetail = lazy(() => import('./admin/ProjectDetail'));
const Tracking = lazy(() => import('./admin/Tracking'));
const Appointments = lazy(() => import('./admin/Appointments'));
const AISettingsPage = lazy(() => import('./admin/AISettings'));
const Notifications = lazy(() => import('./admin/Notifications'));
const Reports = lazy(() => import('./admin/Reports'));
const Users = lazy(() => import('./admin/Users'));
const Content = lazy(() => import('./admin/Content'));
const SettingsPage = lazy(() => import('./admin/Settings'));
const Guide = lazy(() => import('./admin/Guide'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, ready } = useSession();
  const loc = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: loc.pathname + loc.search }} />;
  return children;
}

const Loading = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-400/20 border-t-gold-300" />
  </div>
);

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <SessionProvider>
          <HashRouter>
            <ScrollTop />
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route element={<PublicLayout />}>
                  <Route index element={<Home />} />
                  <Route path="about" element={<About />} />
                  <Route path="services" element={<ServicesIndex />} />
                  <Route path="services/:slug" element={<ServiceDetail />} />
                  <Route path="portfolio" element={<Portfolio />} />
                  <Route path="blog" element={<BlogIndex />} />
                  <Route path="blog/:slug" element={<BlogPostPage />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="quote" element={<Quote />} />
                  <Route path="book" element={<Book />} />
                  <Route path="track" element={<Track />} />
                  <Route path="conversation/:token" element={<ConversationPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
                <Route path="admin/login" element={<Login />} />
                <Route
                  path="admin"
                  element={
                    <RequireAuth>
                      <AdminLayout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="inquiries" element={<Inquiries />} />
                  <Route path="inquiries/:id" element={<InquiryDetail />} />
                  <Route path="chat" element={<Chat />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="customers/:id" element={<CustomerDetail />} />
                  <Route path="services" element={<ServicesAdmin />} />
                  <Route path="portfolio" element={<PortfolioAdmin />} />
                  <Route path="blog" element={<BlogAdmin />} />
                  <Route path="quotations" element={<Quotations />} />
                  <Route path="quotations/:id" element={<QuotationEditor />} />
                  <Route path="projects" element={<Projects />} />
                  <Route path="projects/:id" element={<ProjectDetail />} />
                  <Route path="tracking" element={<Tracking />} />
                  <Route path="appointments" element={<Appointments />} />
                  <Route path="ai" element={<AISettingsPage />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="users" element={<Users />} />
                  <Route path="content" element={<Content />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="guide" element={<Guide />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Route>
              </Routes>
            </Suspense>
            <Toaster />
          </HashRouter>
        </SessionProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
