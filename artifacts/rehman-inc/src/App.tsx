import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import HomePage from '@/pages/home';
import HowItWorksPage from '@/pages/how-it-works';
import SellYourHousePage from '@/pages/sell-your-house';
import WhyUsPage from '@/pages/why-us';
import PropertiesPage from '@/pages/properties';
import FaqPage from '@/pages/faq';
import ContactPage from '@/pages/contact';
import PrivacyPage from '@/pages/privacy';
import TermsPage from '@/pages/terms';
import AdminLogin from '@/pages/admin/login';
import AdminDashboard from '@/pages/admin/dashboard';
import AdminInquiryDetail from '@/pages/admin/inquiry';
import { ScrollToTop } from '@/components/scroll-to-top';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/how-it-works" component={HowItWorksPage} />
        <Route path="/sell-your-house" component={SellYourHousePage} />
        <Route path="/why-us" component={WhyUsPage} />
        <Route path="/properties" component={PropertiesPage} />
        <Route path="/faq" component={FaqPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/admin" component={AdminLogin} />
        <Route path="/admin/dashboard" component={AdminDashboard} />
        <Route path="/admin/inquiries/:id" component={AdminInquiryDetail} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
