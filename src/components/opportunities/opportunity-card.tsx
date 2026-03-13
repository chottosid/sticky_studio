import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { CalendarDays, Newspaper, Image as ImageIcon, FileText, BrainCircuit, Clock, Sparkles, Briefcase, GraduationCap, Trophy, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Opportunity, OpportunityCategory } from '@/lib/types';
import { useDeadlineStatus } from '@/hooks/use-deadline-status';

// Academic terms and fields to highlight
const ACADEMIC_TERMS = [
  // Academic years and semesters
  'fall 2024', 'spring 2024', 'summer 2024', 'winter 2024',
  'fall 2025', 'spring 2025', 'summer 2025', 'winter 2025',
  'fall 2026', 'spring 2026', 'summer 2026', 'winter 2026',
  'fall 2027', 'spring 2027', 'summer 2027', 'winter 2027',
  'fall 2028', 'spring 2028', 'summer 2028', 'winter 2028',
  // Academic degrees
  'phd', 'ph.d', 'doctorate', 'doctoral', 'master', 'masters', 'mba', 'ms', 'ma', 'mfa', 'm.ed', 'm.eng',
  'bachelor', 'bachelors', 'ba', 'bs', 'b.eng', 'b.ed', 'b.fa',
  // Academic fields
  'computer science', 'cs', 'engineering', 'mathematics', 'physics', 'chemistry', 'biology', 'medicine',
  'business', 'economics', 'finance', 'marketing', 'management', 'accounting',
  'psychology', 'sociology', 'political science', 'history', 'literature', 'philosophy',
  'art', 'design', 'architecture', 'music', 'theater', 'film',
  'education', 'teaching', 'pedagogy', 'curriculum',
  'law', 'legal', 'jurisprudence', 'criminology',
  'nursing', 'healthcare', 'public health', 'epidemiology',
  'environmental science', 'sustainability', 'climate', 'ecology',
  'data science', 'artificial intelligence', 'machine learning', 'cybersecurity',
  'robotics', 'biotechnology', 'neuroscience', 'genetics',
  // Academic terms
  'thesis', 'dissertation', 'research', 'scholarship', 'fellowship', 'grant', 'funding',
  'admission', 'application', 'deadline', 'requirements', 'eligibility', 'criteria',
  'gpa', 'gre', 'toefl', 'ielts', 'sat', 'act', 'lsat', 'mcat', 'gmat',
  'undergraduate', 'graduate', 'postgraduate', 'postdoc', 'postdoctoral',
  'full-time', 'part-time', 'online', 'hybrid', 'remote', 'campus',
  'tuition', 'stipend', 'salary', 'benefits', 'housing', 'meal plan'
];

const highlightText = (text: string) => {
  if (!text) return text;
  
  let highlightedText = text;
  
  ACADEMIC_TERMS.forEach(term => {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    highlightedText = highlightedText.replace(regex, (match) => {
      return `<mark class="bg-yellow-200 text-yellow-900 px-1 rounded font-medium">${match}</mark>`;
    });
  });
  
  return highlightedText;
};

type OpportunityCardProps = {
  opportunity: Opportunity;
};

const iconMap: Record<Opportunity['documentType'], React.ElementType> = {
  image: ImageIcon,
  pdf: Newspaper,
  text: FileText,
  unknown: BrainCircuit,
};

const getCardGradient = (documentType: Opportunity['documentType']) => {
  switch (documentType) {
    case 'image':
      return 'from-blue-500/10 to-purple-500/10 border-blue-200/50';
    case 'pdf':
      return 'from-red-500/10 to-pink-500/10 border-red-200/50';
    case 'text':
      return 'from-green-500/10 to-emerald-500/10 border-green-200/50';
    default:
      return 'from-purple-500/10 to-indigo-500/10 border-purple-200/50';
  }
};

const getIconColor = (documentType: Opportunity['documentType']) => {
  switch (documentType) {
    case 'image':
      return 'text-blue-600';
    case 'pdf':
      return 'text-red-600';
    case 'text':
      return 'text-green-600';
    default:
      return 'text-purple-600';
  }
};

const categoryConfig: Record<OpportunityCategory, { label: string; icon: React.ElementType; color: string }> = {
  'job': { label: 'Job', icon: Briefcase, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  'internship': { label: 'Internship', icon: GraduationCap, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  'contest': { label: 'Contest', icon: Trophy, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  'higher-study': { label: 'Higher Study', icon: BookOpen, color: 'bg-teal-100 text-teal-700 border-teal-200' },
};

export default function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const Icon = iconMap[opportunity.documentType] || BrainCircuit;
  const category = opportunity.category || 'job';
  const CategoryIcon = categoryConfig[category].icon;

  const formattedDeadline = opportunity.deadline && typeof opportunity.deadline === 'string'
    ? format(parseISO(opportunity.deadline), 'MMM dd, yyyy')
    : null;

  const { isPast: isPastDeadline, isUrgent } = useDeadlineStatus(opportunity.deadline);

  return (
    <Link href={`/opportunity/${opportunity.id}`} className="block transition-all duration-300 hover:scale-105 hover:shadow-2xl">
      <Card className={cn(
        "flex h-full flex-col overflow-hidden shadow-lg hover:shadow-2xl border-2 transition-all duration-300",
        `bg-gradient-to-br ${getCardGradient(opportunity.documentType)}`,
        isUrgent && !isPastDeadline && "ring-2 ring-orange-400/50 shadow-orange-200/50"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle
                className="font-headline text-lg leading-tight text-gray-800 group-hover:text-primary transition-colors"
                dangerouslySetInnerHTML={{
                  __html: highlightText(opportunity.name)
                }}
              />
              {isUrgent && !isPastDeadline && (
                <div className="flex items-center gap-1 mt-1">
                  <Sparkles className="h-3 w-3 text-orange-500" />
                  <span className="text-xs font-medium text-orange-600">Urgent</span>
                </div>
              )}
            </div>
            <div className={cn("p-2 rounded-lg bg-white/50", getIconColor(opportunity.documentType))}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
          <CardDescription
            className="line-clamp-3 pt-2 text-sm text-gray-600 leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: highlightText(opportunity.details)
            }}
          />
        </CardHeader>
        <CardContent className="flex-grow" />
        <CardFooter className="pt-0">
          <div className="flex items-center justify-between w-full gap-2">
            <Badge
              variant="outline"
              className={cn("text-xs font-medium px-2 py-0.5", categoryConfig[category].color)}
            >
              <CategoryIcon className="mr-1 h-3 w-3" />
              {categoryConfig[category].label}
            </Badge>
            {formattedDeadline ? (
              <Badge
                variant={isPastDeadline ? 'destructive' : isUrgent ? 'default' : 'secondary'}
                className={cn(
                  "text-xs font-medium px-2 py-0.5",
                  isPastDeadline && "bg-red-100 text-red-700 border-red-200",
                  isUrgent && !isPastDeadline && "bg-orange-100 text-orange-700 border-orange-200",
                  !isUrgent && !isPastDeadline && "bg-green-100 text-green-700 border-green-200"
                )}
              >
                <CalendarDays className="mr-1 h-3 w-3" />
                {isPastDeadline ? 'Passed' : formattedDeadline}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs font-medium px-2 py-0.5 bg-gray-100 text-gray-600 border-gray-200">
                <Clock className="mr-1 h-3 w-3" />
                No Deadline
              </Badge>
            )}
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
