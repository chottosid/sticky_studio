'use client';

import React from 'react';
import { Opportunity } from '@/lib/types';
import OpportunityCard from './opportunity-card';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Search, X, Loader2, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getOpportunitiesAction } from '@/lib/actions';

// Simple debounce hook inline
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

type SortOption = 'created_at' | 'deadline' | 'name';
type SortOrder = 'ASC' | 'DESC';

interface PaginatedOpportunityListProps {
  initialOpportunities: Opportunity[];
  initialTotal: number;
}

const ITEMS_PER_PAGE = 6;

export default function PaginatedOpportunityList({ 
  initialOpportunities, 
  initialTotal 
}: PaginatedOpportunityListProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(initialOpportunities);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(initialTotal);
  const [sortBy, setSortBy] = useState<SortOption>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESC');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Debounce search query to avoid too many API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const fetchOpportunities = useCallback(async (
    page: number,
    sort: SortOption,
    order: SortOrder,
    search?: string
  ) => {
    setIsLoading(true);
    try {
      const result = await getOpportunitiesAction(page, ITEMS_PER_PAGE, sort, order, search);
      
      if (result.success) {
        setOpportunities(result.opportunities);
        setTotal(result.total);
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch opportunities when filters change (reset to page 1)
  useEffect(() => {
    setCurrentPage(1);
    fetchOpportunities(1, sortBy, sortOrder, debouncedSearchQuery);
  }, [debouncedSearchQuery, sortBy, sortOrder, fetchOpportunities]);

  // Fetch opportunities when page changes
  useEffect(() => {
    fetchOpportunities(currentPage, sortBy, sortOrder, debouncedSearchQuery);
  }, [currentPage, fetchOpportunities, sortBy, sortOrder, debouncedSearchQuery]);

  const handleSortChange = (value: string) => {
    const [field, order] = value.split('-') as [SortOption, SortOrder];
    setSortBy(field);
    setSortOrder(order);
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  // Refresh function to be passed to opportunity cards
  const handleRefresh = useCallback(() => {
    fetchOpportunities(currentPage, sortBy, sortOrder, debouncedSearchQuery);
  }, [currentPage, sortBy, sortOrder, debouncedSearchQuery, fetchOpportunities]);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  // Pagination helpers
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage && !isLoading) {
      setCurrentPage(page);
    }
  };

  const goToFirstPage = () => goToPage(1);
  const goToLastPage = () => goToPage(totalPages);
  const goToPreviousPage = () => goToPage(currentPage - 1);
  const goToNextPage = () => goToPage(currentPage + 1);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const delta = 2; // Number of pages to show on each side of current page
    const range = [];
    const rangeWithDots = [];

    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i);
    }

    if (currentPage - delta > 2) {
      rangeWithDots.push(1, '...');
    } else {
      rangeWithDots.push(1);
    }

    rangeWithDots.push(...range);

    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push('...', totalPages);
    } else {
      if (totalPages > 1) {
        rangeWithDots.push(totalPages);
      }
    }

    return rangeWithDots;
  };

  return (
    <div className="space-y-6">
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search opportunities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <Select value={`${sortBy}-${sortOrder}`} onValueChange={handleSortChange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at-DESC">Newest First</SelectItem>
              <SelectItem value="created_at-ASC">Oldest First</SelectItem>
              <SelectItem value="deadline-ASC">Deadline Soon</SelectItem>
              <SelectItem value="deadline-DESC">Deadline Later</SelectItem>
              <SelectItem value="name-ASC">Name A-Z</SelectItem>
              <SelectItem value="name-DESC">Name Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total === 0 
            ? 'No opportunities found' 
            : `Showing ${(currentPage - 1) * ITEMS_PER_PAGE + 1}-${Math.min(currentPage * ITEMS_PER_PAGE, total)} of ${total} opportunities`
          }
        </span>
        {debouncedSearchQuery && (
          <span>Search: "{debouncedSearchQuery}"</span>
        )}
      </div>

      {/* Opportunities Grid */}
      {isLoading && opportunities.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: ITEMS_PER_PAGE }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="bg-gray-200 h-48 rounded-lg"></div>
            </div>
          ))}
        </div>
      ) : opportunities.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground">
            {debouncedSearchQuery 
              ? 'No opportunities match your search criteria.' 
              : 'No opportunities found. Add your first opportunity to get started!'
            }
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {opportunities.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
              {/* Page Info */}
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>

              {/* Pagination Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToFirstPage}
                  disabled={currentPage === 1 || isLoading}
                  className="h-8 w-8 p-0"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1 || isLoading}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1">
                  {getPageNumbers().map((pageNum, index) => (
                    <React.Fragment key={index}>
                      {pageNum === '...' ? (
                        <span className="px-2 py-1 text-muted-foreground">...</span>
                      ) : (
                        <Button
                          variant={pageNum === currentPage ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(pageNum as number)}
                          disabled={isLoading}
                          className="h-8 w-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      )}
                    </React.Fragment>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages || isLoading}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToLastPage}
                  disabled={currentPage === totalPages || isLoading}
                  className="h-8 w-8 p-0"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Items per page info */}
              <div className="text-sm text-muted-foreground">
                {ITEMS_PER_PAGE} per page
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}