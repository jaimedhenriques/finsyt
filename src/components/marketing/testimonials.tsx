'use client';

import { useState } from 'react';
import { Quote, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const testimonials = [
  {
    quote:
      "Finsyt has completely transformed how I do research. What used to take me hours now takes minutes. The AI understands exactly what I'm looking for and provides comprehensive, sourced answers.",
    author: 'Michael Chen',
    role: 'Portfolio Manager',
    company: 'Apex Capital',
    rating: 5,
    image: null,
  },
  {
    quote:
      "As a financial advisor, I need to quickly research investments for my clients. Finsyt lets me pull up any information instantly and generate client-ready reports in seconds.",
    author: 'Sarah Williams',
    role: 'Financial Advisor',
    company: 'Merrill Lynch',
    rating: 5,
    image: null,
  },
  {
    quote:
      "The SEC filing analysis is incredible. I can ask specific questions about any 10-K or 10-Q and get precise answers with citations. It's like having a research assistant that never sleeps.",
    author: 'David Park',
    role: 'Equity Research Analyst',
    company: 'Goldman Sachs',
    rating: 5,
    image: null,
  },
  {
    quote:
      "I was skeptical about AI-powered research, but Finsyt proved me wrong. The accuracy is impressive, and the natural language interface makes it accessible to everyone on my team.",
    author: 'Jennifer Martinez',
    role: 'Investment Director',
    company: 'Vanguard',
    rating: 5,
    image: null,
  },
  {
    quote:
      "Finsyt gives me the same quality research tools that big institutions have, at a fraction of the cost. It's leveled the playing field for individual investors like me.",
    author: 'Robert Thompson',
    role: 'Individual Investor',
    company: 'Self-employed',
    rating: 5,
    image: null,
  },
  {
    quote:
      "We use Finsyt for our investment club meetings. The ability to quickly research and compare stocks during our discussions has made our meetings much more productive.",
    author: 'Amanda Lee',
    role: 'Club President',
    company: 'Bay Area Investors Club',
    rating: 5,
    image: null,
  },
];

export function Testimonials() {
  const [activeIndex, setActiveIndex] = useState(0);

  const nextTestimonial = () => {
    setActiveIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setActiveIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Featured Testimonial */}
      <div className="relative mb-12">
        <div className="absolute -top-4 -left-4 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Quote className="w-8 h-8 text-primary" />
        </div>

        <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/20 p-8 md:p-12">
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="flex-1">
              {/* Rating */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonials[activeIndex].rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-5 h-5 fill-yellow-400 text-yellow-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <blockquote className="text-lg md:text-xl text-foreground mb-6 leading-relaxed">
                "{testimonials[activeIndex].quote}"
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">
                    {testimonials[activeIndex].author
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                </div>
                <div>
                  <p className="font-semibold">{testimonials[activeIndex].author}</p>
                  <p className="text-sm text-muted-foreground">
                    {testimonials[activeIndex].role} at {testimonials[activeIndex].company}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t">
            <div className="flex gap-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    'w-2 h-2 rounded-full transition-all',
                    index === activeIndex
                      ? 'w-8 bg-primary'
                      : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  )}
                  aria-label={`Go to testimonial ${index + 1}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={prevTestimonial}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={nextTestimonial}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Testimonial Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {testimonials
          .filter((_, index) => index !== activeIndex)
          .slice(0, 3)
          .map((testimonial, index) => (
            <div
              key={testimonial.author}
              className="rounded-xl border bg-card p-6 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
              onClick={() =>
                setActiveIndex(
                  testimonials.findIndex((t) => t.author === testimonial.author)
                )
              }
            >
              {/* Rating */}
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 fill-yellow-400 text-yellow-400"
                  />
                ))}
              </div>

              {/* Quote */}
              <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                "{testimonial.quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">
                    {testimonial.author
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium">{testimonial.author}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Stats */}
      <div className="mt-12 grid grid-cols-3 gap-6 text-center">
        <div className="p-6 rounded-xl border bg-card">
          <div className="text-3xl font-bold text-primary mb-1">4.9/5</div>
          <div className="text-sm text-muted-foreground">Average Rating</div>
        </div>
        <div className="p-6 rounded-xl border bg-card">
          <div className="text-3xl font-bold text-primary mb-1">50,000+</div>
          <div className="text-sm text-muted-foreground">Happy Users</div>
        </div>
        <div className="p-6 rounded-xl border bg-card">
          <div className="text-3xl font-bold text-primary mb-1">98%</div>
          <div className="text-sm text-muted-foreground">Satisfaction Rate</div>
        </div>
      </div>
    </div>
  );
}
