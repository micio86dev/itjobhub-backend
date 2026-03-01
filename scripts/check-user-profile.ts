import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkUserProfile() {
  try {
    const email = "micio86dev@gmail.com";
    
    console.log(`\n🔍 Searching for user with email: ${email}\n`);
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: true
      }
    });

    if (!user) {
      console.log(`❌ User not found with email: ${email}`);
      return;
    }

    console.log(`✅ User found:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.first_name} ${user.last_name}`);
    console.log(`   Role: ${user.role}`);
    
    if (user.profile) {
      console.log(`\n✅ Profile found:`);
      console.log(`   Profile ID: ${user.profile.id}`);
      console.log(`   Languages: ${user.profile.languages.join(", ")}`);
      console.log(`   Skills: ${user.profile.skills.join(", ")}`);
      console.log(`   Seniority: ${user.profile.seniority || "N/A"}`);
      console.log(`   Availability: ${user.profile.availability || "N/A"}`);
      console.log(`   Work Modes: ${user.profile.workModes.join(", ")}`);
      console.log(`   💰 Salary Min: ${user.profile.salaryMin}`);
      console.log(`   Bio: ${user.profile.bio || "N/A"}`);
      console.log(`   Location: ${user.profile.location || "N/A"}`);
      console.log(`   GitHub: ${user.profile.github || "N/A"}`);
      console.log(`   LinkedIn: ${user.profile.linkedin || "N/A"}`);
      console.log(`   Website: ${user.profile.website || "N/A"}`);
      console.log(`   CV URL: ${user.profile.cv_url || "N/A"}`);
    } else {
      console.log(`\n❌ No profile found for this user`);
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserProfile();
