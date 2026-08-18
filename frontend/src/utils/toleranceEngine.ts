export interface ToleranceResult {
  lowerLimit: number;
  upperLimit: number;
  status: 'OK' | 'TO CHECK' | 'NOT ACCEPTABLE' | 'PENDING';
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
      message: 'Nominal drawing dimension required'
    };
  }

  const upperTol = upperTolerance !== null && upperTolerance !== undefined && !isNaN(upperTolerance) ? upperTolerance : 0;
  const lowerTol = lowerTolerance !== null && lowerTolerance !== undefined && !isNaN(lowerTolerance) ? lowerTolerance : 0;

  // Handle standard symmetric and asymmetric tolerances:
  // e.g. if lowerTol is +0.05 while upperTol is +0.05, it means ±0.05 -> lower offset is -0.05
  const effectiveLowerTol = lowerTol > 0 && upperTol >= 0 ? -lowerTol : lowerTol;
  
  const upperLimit = Number((nominalValue + upperTol).toFixed(4));
  const lowerLimit = Number((nominalValue + effectiveLowerTol).toFixed(4));

  if (actualValue === null || actualValue === undefined || isNaN(actualValue)) {
    return {
      lowerLimit,
      upperLimit,
      status: 'PENDING',
      message: 'Measurement reading pending'
    };
  }

  // Check out of bounds (NOT ACCEPTABLE / FAIL)
  if (actualValue < lowerLimit || actualValue > upperLimit) {
    return {
      lowerLimit,
      upperLimit,
      status: 'NOT ACCEPTABLE',
      message: `Reading ${actualValue} exceeds tolerance limits [${lowerLimit}, ${upperLimit}]`
    };
  }

  // Check boundary margin (TO CHECK / YELLOW)
  const totalRange = upperLimit - lowerLimit;
  if (totalRange > 0) {
    const margin = totalRange * (checkThresholdPercent / 100);
    const nearLower = actualValue <= lowerLimit + margin;
    const nearUpper = actualValue >= upperLimit - margin;
    if (nearLower || nearUpper) {
      return {
        lowerLimit,
        upperLimit,
        status: 'TO CHECK',
        message: `Reading ${actualValue} is within ${checkThresholdPercent}% of tolerance boundary`
      };
    }
  }

  // In tolerance (OK / GREEN)
  return {
    lowerLimit,
    upperLimit,
    status: 'OK',
    message: `Reading ${actualValue} is within acceptable tolerance limits`
  };
}

export function evaluateMultiReadings(
  nominalValue: number | null | undefined,
  upperTolerance: number | null | undefined,
  lowerTolerance: number | null | undefined,
  readings: (number | null | undefined)[],
  checkThresholdPercent: number = 10
): ToleranceResult {
  const validReadings = readings.filter((r): r is number => r !== null && r !== undefined && !isNaN(r));

  if (validReadings.length === 0) {
    return calculateTolerance(nominalValue, upperTolerance, lowerTolerance, null, checkThresholdPercent);
  }

  // Calculate status for each reading
  const results = validReadings.map((r) =>
    calculateTolerance(nominalValue, upperTolerance, lowerTolerance, r, checkThresholdPercent)
  );

  const lowerLimit = results[0].lowerLimit;
  const upperLimit = results[0].upperLimit;

  // Worst-case status wins: NOT ACCEPTABLE > TO CHECK > OK
  if (results.some((res) => res.status === 'NOT ACCEPTABLE')) {
    return {
      lowerLimit,
      upperLimit,
      status: 'NOT ACCEPTABLE',
      message: 'One or more observation readings exceed tolerance limits'
    };
  }

  if (results.some((res) => res.status === 'TO CHECK')) {
    return {
      lowerLimit,
      upperLimit,
      status: 'TO CHECK',
      message: 'One or more observation readings are near the tolerance boundary'
    };
  }

  return {
    lowerLimit,
    upperLimit,
    status: 'OK',
    message: 'All observation readings are within specification'
  };
}
