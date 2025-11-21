async function main(event, context) {
  const issues = []
  const errorRate = 0

  return {
    body: {
      success: true,
      issuesDetected: issues.length,
      errorRate: (errorRate * 100).toFixed(2) + '%',
    },
  }
}

exports.main = main
