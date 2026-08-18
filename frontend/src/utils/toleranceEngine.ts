export interface ToleranceResult {
  lowerLimit: number;
  upperLimit: number;
  status: 'PASS' | 'CHECK' | 'FAIL' | 'PENDING';
  message: string;
}

export function calculateTolerance(
  nominalValue: number | null | undefined,
  upperTolerance: number | null | undefined,
  lowerTolerance: number | null | undefined,
  actualValue: number | null | undefined,
  checkThresholdPercent: number = 10
): ToleranceResult {
  if (nominalValue === null || nominalValue === undefined || isNaN(nominalValue)) {
    return {
      lowerLimit: 0,
      upperLimit: 0,
      status: 'PENDING',
      message: 'Nominal dimension is required'
    };
  }

  const upperTol = upperTolerance !== null && upperTolerance !== undefined && !isNaN(upperTolerance) ? upperTolerance : 0;
  const lowerTol = lowerTolerance !== null && lowerTolerance !== undefined && !isNaN(lowerTolerance) ? lowerTolerance : 0;

  // In standard engineering drawings:
  // If lowerTol is given as positive e.g. 0.05 when upper is +0.05 (symmetric ±0.05), lower offset is negative.
  // If lowerTol is already negative e.g. -0.10, upperLimit = nominal + upperTol, lowerLimit = nominal + lowerTol.
  const effectiveLowerTol = lowerTol > 0 && upperTol >= 0 ? -lowerTol : lowerTol;
  
  const upperLimit = Number((nominalValue + upperTol).toFixed(4));
  const lowerLimit = Number((nominalValue + effectiveLowerTol).toFixed(4));

  if (actualValue === null || actualValue === undefined || isNaN(actualValue)) {
    return {
      lowerLimit,
      upperLimit,
      status: 'PENDING',
      message: 'Actual physical measurement pending'
    };
  }

  // Check out of bounds (FAIL)
  if (actualValue < lowerLimit || actualValue > upperLimit) {
    return {
      lowerLimit,
      upperLimit,
      status: 'FAIL',
      message: `Actual ${actualValue} is out of limits [${lowerLimit}, ${upperLimit}]`
    };
  }

  // Within bounds -> check if near upper or lower boundary (CHECK)
  const totalRange = upperLimit - lowerLimit;
  if (totalRange > 0) {
    const margin = totalRange * (checkThresholdPercent / 100);
    const nearLower = actualValue <= lowerLimit + margin;
    const nearUpper = actualValue >= upperLimit - margin;
    if (nearLower || nearUpper) {
      return {
        lowerLimit,
        upperLimit,
        status: 'CHECK',
        message: `Actual ${actualValue} is within ${checkThresholdPercent}% of tolerance boundary`
      };
    }
  }

  // Strictly in tolerance (PASS)
  return {
    lowerLimit,
    upperLimit,
    status: 'PASS',
    message: `Actual ${actualValue} is within specification [${lowerLimit}, ${upperLimit}]`
  };
}
