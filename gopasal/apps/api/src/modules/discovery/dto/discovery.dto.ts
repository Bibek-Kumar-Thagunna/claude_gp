import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

/** A lat/lng point supplied as query params (?lat=..&lng=..). */
export class GeoQueryDto {
  @ApiProperty({ example: 27.7172 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 85.324 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}

export class NearbyQueryDto extends GeoQueryDto {
  @ApiPropertyOptional({ example: 5, description: "Search radius in km (max 25)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(25)
  radiusKm?: number;
}

export class SearchQueryDto {
  @ApiProperty({ example: "momo" })
  @IsString()
  @MinLength(2)
  q!: string;

  @ApiPropertyOptional({ example: 27.7172, description: "Selected delivery latitude" })
  @ValidateIf((row: SearchQueryDto) => row.lat !== undefined || row.lng !== undefined)
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 85.324, description: "Selected delivery longitude" })
  @ValidateIf((row: SearchQueryDto) => row.lat !== undefined || row.lng !== undefined)
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

export class PlaceSuggestQueryDto {
  @ApiProperty({ example: "Baneswhor" })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ description: "Bias suggestions towards the selected latitude" })
  @ValidateIf((row: PlaceSuggestQueryDto) => row.lat !== undefined || row.lng !== undefined)
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ description: "Bias suggestions towards the selected longitude" })
  @ValidateIf((row: PlaceSuggestQueryDto) => row.lat !== undefined || row.lng !== undefined)
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

export class PlaceResolveQueryDto {
  @ApiProperty({ description: "Opaque place id returned by the suggestion endpoint" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  placeId!: string;
}
