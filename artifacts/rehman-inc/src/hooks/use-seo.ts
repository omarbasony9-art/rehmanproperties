import { useEffect } from 'react';

interface SEOOptions {
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

function setMeta(selector: string, attr: string, value: string, content: string) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, value);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function useSEO(title: string, description: string, options?: SEOOptions) {
  const { ogTitle, ogDescription, ogImage } = options ?? {};
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]',   'name',     'description',    description);
    setMeta('meta[property="og:title"]',  'property', 'og:title',       ogTitle || title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', ogDescription || description);
    if (ogImage) {
      setMeta('meta[property="og:image"]', 'property', 'og:image', ogImage);
    }
  }, [title, description, ogTitle, ogDescription, ogImage]);
}
