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
  if (nominalValue === null || nominalValue === undefined) {
    return {
      lowerLimit: 0,
      upperLimit: 0,
      status: 'PENDING',
      message: 'Nominal value is missing'
    };
  }

  const upperTol = upperTolerance ?? 0;
  const lowerTol = lowerTolerance ?? 0;

  // Upper limit = nominal + upperTol
  // Lower limit = nominal - Math.abs(lowerTol) if lowerTol is intended as -TOL offset, or nominal + lowerTol if negative
  const effectiveLowerTol = lowerTol > 0 && upperTol >= 0 ? -lowerTol : lowerTol;
  const upperLimit = Number((nominalValue + upperTol).toFixed(4));
  const lowerLimit = Number((nominalValue + effectiveLowerTol).toFixed(4));

  if (actualValue === null || actualValue === undefined || isNaN(actualValue)) {
    return {
      lowerLimit,
      upperLimit,
      status: 'PENDING',
      message: 'Measurement actual value pending'
    };
  }

  // Validate bounds
  if (actualValue < lowerLimit || actualValue > upperLimit) {
    return {
      lowerLimit,
      upperLimit,
      status: 'FAIL',
      message: `Actual value ${actualValue} is out of limits [${lowerLimit}, ${upperLimit}]`
    };
  }

  // Within bounds -> check if close to boundary (CHECK status)
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
        message: `Actual value ${actualValue} is within ${checkThresholdPercent}% threshold of tolerance limit`
      };
    }
  }

  return {
    lowerLimit,
    upperLimit,
    status: 'PASS',
    message: `Actual value ${actualValue} is within nominal tolerance limits`
  };
}
