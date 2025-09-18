'use client';

import { Opportunity } from '@/lib/types';
import OpportunityCard from './opportunity-card';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ArrowUpDown, Calendar, Clock, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type OpportunityListProps = {
  opportunities: Opportunity[];
};

type SortOption = 'newest' | 'oldest' | 'deadline-asc' | 'deadline-desc' | 'name-asc' | 'name-desc';

const ITEMS_PER_PAGE = 6;

export default function OpportunityList({ opportunities }: OpportunityListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAndSortedOpportunities = useMemo(() => {
    let filtered = opportunities;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = opportunities.filter(opportunity => 
        opportunity.name.toLowerCase().includes(query) ||
        opportunity.details.toLowerCase().includes(query) ||
        (opportunity.deadline && opportunity.deadline.toLowerCase().includes(query))
      );
    }
    
    // Apply sorting
    const sorted = [...filtered];
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
      case 'deadline-asc':
        return sorted.sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        });
      case 'deadline-desc':
        return sorted.sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(b.deadline).getTime() - new Date(a.deadline).getTime();
        });
      case 'name-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      default:
        return sorted;
    }
  }, [opportunities, sortBy, searchQuery]);

  const totalPages = Math.ceil(filteredAndSortedOpportunities.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentOpportunities = filteredAndSortedOpportunities.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const clearSearch = () => {
    setSearchQuery('');
    setCurrentPage(1);
  };

  if (opportunities.length === 0) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 py-16 text-center">
        <div className="rounded-full bg-primary/10 p-4 mb-4">
          <Calendar className="h-8 w-8 text-primary" />
        </div>
        <h3 className="font-headline text-2xl font-semibold text-primary mb-2">No Opportunities Yet</h3>
        <p className="text-muted-foreground max-w-md">Start building your opportunity collection by adding your first scholarship, PhD position, or competition!</p>
      </div>
    );
  }

  if (filteredAndSortedOpportunities.length === 0 && searchQuery) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 py-16 text-center">
        <div className="rounded-full bg-primary/10 p-4 mb-4">
          <Search className="h-8 w-8 text-primary" />
        </div>
        <h3 className="font-headline text-2xl font-semibold text-primary mb-2">No Results Found</h3>
        <p className="text-muted-foreground max-w-md mb-4">No opportunities match your search for "{searchQuery}"</p>
        <Button variant="outline" onClick={clearSearch} className="flex items-center gap-2">
          <X className="h-4 w-4" />
          Clear Search
        </Button>
      </div>
    );
  }

  return (
    <div className="col-span-full space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search opportunities by name, details, or deadline..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="pl-10 pr-10 h-12 text-base bg-white/50 backdrop-blur-sm border-primary/20 focus:border-primary/40"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSearch}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-destructive/10"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Sorting and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-gradient-to-r from-primary/5 to-accent/5 p-4 rounded-xl border border-primary/10">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Sort by:</span>
          <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="deadline-asc">Deadline (Soonest)</SelectItem>
              <SelectItem value="deadline-desc">Deadline (Latest)</SelectItem>
              <SelectItem value="name-asc">Name (A-Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z-A)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>
            Showing {startIndex + 1}-{Math.min(endIndex, filteredAndSortedOpportunities.length)} of {filteredAndSortedOpportunities.length} opportunities
          </span>
        </div>
      </div>

      {/* Opportunities Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {currentOpportunities.map((opportunity) => (
          <OpportunityCard key={opportunity.id} opportunity={opportunity} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => handlePageChange(page)}
                className={cn(
                  "w-10 h-10",
                  currentPage === page && "bg-primary text-primary-foreground"
                )}
              >
                {page}
              </Button>
            ))}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
