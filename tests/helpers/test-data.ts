// Test data generators for consistent test scenarios
export const testUsers = {
  admin: {
    email: "admin@test.com",
    password: "password123",
    firstName: "Admin",
    lastName: "User"
  },
  company: {
    email: "company@test.com",
    password: "password123",
    firstName: "Company",
    lastName: "User"
  },
  jobSeeker: {
    email: "seeker@test.com",
    password: "password123",
    firstName: "Job",
    lastName: "Seeker"
  }
};

export const testCompany = {
  name: "Test Company Inc",
  description: "A test company for our testing suite",
  website: "https://testcompany.com",
  logo: "https://testcompany.com/logo.png"
};

export const testJob = {
  title: "Senior Software Developer",
  description: "We are looking for a senior software developer to join our team",
  location: "Remote",
  salaryMin: 80000,
  salaryMax: 120000,
  seniority: "SENIOR",
  skills: ["JavaScript", "TypeScript", "Node.js", "React"],
  remote: true
};

export const testComment = {
  content: "This looks like a great opportunity!"
};

export const testProfile = {
  languages: ["English", "Italian"],
  skills: ["JavaScript", "TypeScript", "Node.js"],
  seniority: "SENIOR",
  availability: "AVAILABLE",
  bio: "Experienced software developer",
  github: "https://github.com/testuser",
  linkedin: "https://linkedin.com/in/testuser",
  website: "https://testuser.dev"
};