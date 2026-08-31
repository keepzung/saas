-- AlterTable
ALTER TABLE "User" ADD COLUMN     "moduleIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
