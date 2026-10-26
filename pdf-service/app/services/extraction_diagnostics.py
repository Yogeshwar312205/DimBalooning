"""
Stage-by-stage dimension detection diagnostics.
Tracks input/output counts and rejection reasons at each pipeline stage.
"""

class ExtractionDiagnostics:
    """Tracks dimension detection pipeline metrics."""
    
    def __init__(self):
        self.reset()
    
    def reset(self):
        """Reset all counters."""
        self.stats = {
            'vector_text_elements': 0,
            'ocr_text_elements': 0,
            'candidate_annotations': 0,
            'parsed_dimensions': 0,
            'rejected_candidates': 0,
            'title_block_filtered': 0,
            'duplicate_detections': 0,
            'valid_characteristics': 0,
            'final_balloons': 0,
        }
        
        self.rejections = {
            'unsupported_format': [],
            'parsing_failure': [],
            'classification_rejected': [],
            'confidence_too_low': [],
            'spatial_duplicate': [],
            'title_block_location': [],
            'invalid_coordinates': [],
            'other': []
        }
    
    def record_vector_text(self, count: int):
        """Record count of vector text elements extracted."""
        self.stats['vector_text_elements'] = count
    
    def record_ocr_text(self, count: int):
        """Record count of OCR text elements extracted."""
        self.stats['ocr_text_elements'] = count
    
    def record_candidate(self):
        """Increment candidate annotation count."""
        self.stats['candidate_annotations'] += 1
    
    def record_parsed(self):
        """Increment successfully parsed dimensions."""
        self.stats['parsed_dimensions'] += 1
    
    def record_rejection(self, reason: str, text: str = None):
        """Record rejection with reason."""
        self.stats['rejected_candidates'] += 1
        
        if reason in self.rejections:
            if text:
                self.rejections[reason].append(text)
        else:
            self.rejections['other'].append(f"{reason}: {text}" if text else reason)
    
    def record_title_block_filter(self):
        """Increment title block filtered count."""
        self.stats['title_block_filtered'] += 1
    
    def record_duplicate(self):
        """Increment duplicate detection count."""
        self.stats['duplicate_detections'] += 1
    
    def record_valid_characteristic(self):
        """Increment valid inspection characteristic count."""
        self.stats['valid_characteristics'] += 1
    
    def get_summary(self) -> dict:
        """Get diagnostic summary."""
        return {
            'stats': self.stats,
            'rejection_summary': {
                reason: len(items) for reason, items in self.rejections.items() if items
            },
            'rejection_samples': {
                reason: items[:5] for reason, items in self.rejections.items() if items
            }
        }
    
    def print_report(self):
        """Print human-readable diagnostic report."""
        print("\n" + "="*80)
        print("DIMENSION DETECTION PIPELINE DIAGNOSTICS")
        print("="*80)
        
        print("\nSTAGE INPUT/OUTPUT COUNTS:")
        print("-"*80)
        print(f"  Vector text elements extracted:     {self.stats['vector_text_elements']}")
        print(f"  OCR text elements extracted:        {self.stats['ocr_text_elements']}")
        print(f"  Candidate annotations found:        {self.stats['candidate_annotations']}")
        print(f"  Successfully parsed dimensions:     {self.stats['parsed_dimensions']}")
        print(f"  Rejected candidates:                {self.stats['rejected_candidates']}")
        print(f"  Title block filtered:               {self.stats['title_block_filtered']}")
        print(f"  Duplicate detections:               {self.stats['duplicate_detections']}")
        print(f"  Valid inspection characteristics:   {self.stats['valid_characteristics']}")
        print(f"  Final balloons created:             {self.stats['final_balloons']}")
        
        print("\nREJECTION REASONS:")
        print("-"*80)
        total_rejections = sum(len(items) for items in self.rejections.values())
        if total_rejections > 0:
            for reason, items in self.rejections.items():
                if items:
                    print(f"  {reason:30} : {len(items):4} rejections")
                    if len(items) <= 5:
                        for item in items:
                            print(f"      - {item}")
                    else:
                        for item in items[:3]:
                            print(f"      - {item}")
                        print(f"      ... and {len(items) - 3} more")
        else:
            print("  No rejections recorded")
        
        print("\n" + "="*80)


# Global diagnostics instance
_diagnostics = ExtractionDiagnostics()

def get_diagnostics() -> ExtractionDiagnostics:
    """Get the global diagnostics instance."""
    return _diagnostics

def reset_diagnostics():
    """Reset the global diagnostics."""
    _diagnostics.reset()
