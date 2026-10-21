import type { Metadata } from 'next';
import { DesignShowcase } from './Showcase';
import './design.css';

export const metadata: Metadata = { title: 'Sistema visual' };

export default function DesignPage() {
  return <DesignShowcase />;
}
